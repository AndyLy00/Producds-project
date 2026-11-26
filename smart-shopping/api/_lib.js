// Shared code of the Vercel functions in this folder: MongoDB access, passwords, session tokens.
// Files starting with "_" are not exposed as routes.
import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { MongoClient } from "mongodb";
import { languageOf, tr } from "./_i18n.js";
import { DEVICE_LIFETIME_DAYS } from "./_push.js";

const scryptAsync = promisify(scrypt);
const TOKEN_LIFETIME_SECONDS = 180 * 24 * 60 * 60;

// The web app is served from the same origin, but the Android app calls from its own
// (https://localhost). Sessions travel in the Authorization header, not in cookies, so any
// origin may be allowed.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Lang",
  "Access-Control-Max-Age": "86400",
};

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// `message` is the Russian text of api/_i18n.js; {name} placeholders are filled from `params`.
// The answer is translated into the language the app asked for.
export class HttpError extends Error {
  constructor(status, message, params = {}) {
    super(message);
    this.status = status;
    this.params = params;
  }
}

// Turns thrown HttpErrors into JSON responses; anything else is a 500 whose details stay in the log.
export function route(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      const lang = languageOf(request);
      if (error instanceof HttpError) return json(error.status, { error: tr(lang, error.message, error.params) });
      console.error(error);
      return json(500, { error: tr(lang, "Сервер временно недоступен. Попробуйте позже.") });
    }
  };
}

export async function readJson(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Слишком большой запрос.");
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object") return value;
  } catch {
    // Reported below.
  }
  throw new HttpError(400, "Некорректный запрос.");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is not set`);
  return value;
}

// One client per function instance, reused across invocations.
let clientPromise;
let indexesReady;

export async function database() {
  clientPromise ??= new MongoClient(requiredEnv("MONGODB_URI")).connect();
  const db = (await clientPromise).db(process.env.MONGODB_DB || "korzina");
  indexesReady ??= Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    // MongoDB removes attempt counters by itself once their window has passed.
    db.collection("attempts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("codes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("invites").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("handoffs").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("handoffs").createIndex({ challenge: 1 }),
    // Push tokens of the Android app (api/_push.js); a phone not seen for months is forgotten.
    db.collection("devices").createIndex({ userId: 1, updatedAt: -1 }),
    db.collection("devices").createIndex({ updatedAt: 1 }, { expireAfterSeconds: DEVICE_LIFETIME_DAYS * 86_400 }),
    db.collection("lists").createIndex({ members: 1, serverUpdatedAt: 1 }),
    db.collection("photos").createIndex({ owner: 1, createdAt: 1 }),
    // Unique over the array's values: an account can be in one family only.
    db.collection("families").createIndex({ members: 1 }, { unique: true }),
  ]);
  await indexesReady;
  return db;
}

// Brute-force protection. Attempts are counted per fixed time window in the "attempts"
// collection, one counter per subject ("login:email:anna@example.com", "login:ip:203.0.113.7").
function attemptCounter(subject, windowSeconds) {
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  return { _id: `${subject}:${window}`, expiresAt: new Date((window + 1) * windowSeconds * 1000) };
}

// Counts one attempt and throws 429 when it is over the limit of the current window. Counting
// and checking are one atomic step, so many requests sent at once cannot all slip under the limit.
export async function takeAttempt(subject, limit, windowSeconds) {
  const { _id, expiresAt } = attemptCounter(subject, windowSeconds);
  const counter = await (await database())
    .collection("attempts")
    .findOneAndUpdate({ _id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, returnDocument: "after" });
  if ((counter?.count ?? 1) <= limit) return;
  const minutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));
  throw new HttpError(429, "Слишком много попыток. Попробуйте снова через {minutes} мин.", { minutes });
}

// Takes back an attempt that turned out to be legitimate (a correct password).
export async function returnAttempt(subject, windowSeconds) {
  const { _id } = attemptCounter(subject, windowSeconds);
  await (await database()).collection("attempts").updateOne({ _id, count: { $gt: 0 } }, { $inc: { count: -1 } });
}

export async function clearAttempts(subject, windowSeconds) {
  await (await database()).collection("attempts").deleteOne({ _id: attemptCounter(subject, windowSeconds)._id });
}

// Vercel sets x-real-ip itself, so a client cannot forge it there.
export function clientAddress(request) {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export async function hashPassword(password, salt = randomBytes(16).toString("base64url")) {
  const hash = await scryptAsync(password, salt, 64);
  return { salt, hash: hash.toString("base64url") };
}

export async function passwordMatches(password, user) {
  const { hash } = await hashPassword(password, user.passwordSalt);
  const expected = Buffer.from(user.passwordHash, "base64url");
  const actual = Buffer.from(hash, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sign(payload) {
  return createHmac("sha256", requiredEnv("AUTH_SECRET")).update(payload).digest("base64url");
}

function sameText(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Compact signed token: base64url(JSON payload) + "." + HMAC-SHA256 signature. `tv` is the
// user's token version: changing or resetting the password bumps it and so signs out every
// other device.
export function issueToken(user) {
  const payload = Buffer.from(
    JSON.stringify({ sub: user._id, tv: user.tokenVersion ?? 0, exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// The signed-in user, or 401.
export async function authenticate(request) {
  const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  const [payload, signature] = token.split(".");
  if (payload && signature && sameText(sign(payload), signature)) {
    let claims = null;
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
      // Reported below.
    }
    if (claims && typeof claims.sub === "string" && claims.exp > Date.now() / 1000) {
      const user = await (await database()).collection("users").findOne({ _id: claims.sub });
      if (user && (user.tokenVersion ?? 0) === claims.tv) return user;
    }
  }
  throw new HttpError(401, "Войдите в аккаунт заново.");
}

// What the app keeps about the signed-in account.
export function account(user) {
  return { token: issueToken(user), email: user.email, verified: user.emailVerified === true, hasPassword: Boolean(user.passwordHash) };
}

export function parseEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Укажите корректный адрес почты.");
  return email;
}

export function parsePassword(value) {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8) throw new HttpError(400, "Пароль должен быть не короче 8 символов.");
  if (password.length > 200) throw new HttpError(400, "Слишком длинный пароль.");
  return password;
}

export function parseCredentials(body) {
  return { email: parseEmail(body.email), password: parsePassword(body.password) };
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("base64url");
}

// --- Email -------------------------------------------------------------------------------------
// Sent through Resend (https://resend.com): RESEND_API_KEY and EMAIL_FROM, e.g.
// "Корзина <no-reply@example.com>" on a domain verified in Resend. With EMAIL_TRANSPORT=memory
// (tests) messages are only collected in globalThis.korzinaOutbox.

export function emailEnabled() {
  return process.env.EMAIL_TRANSPORT === "memory" || Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(to, subject, body) {
  if (process.env.EMAIL_TRANSPORT === "memory") {
    (globalThis.korzinaOutbox ??= []).push({ to, subject, text: body });
    return;
  }
  if (!emailEnabled()) throw new HttpError(503, "Отправка писем пока не настроена.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text: body }),
  });
  if (!response.ok) {
    console.error("Resend", response.status, await response.text());
    throw new HttpError(502, "Не удалось отправить письмо. Попробуйте позже.");
  }
}

// --- One-time codes (email verification, password reset) ---------------------------------------

const CODE_LIFETIME_MINUTES = 15;
const CODE_ATTEMPTS = 5;

function codeHash(purpose, userId, code) {
  return sign(`code:${purpose}:${userId}:${code}`);
}

// Creates a new 6-digit code, replacing an earlier one for the same purpose.
export async function issueCode(purpose, userId) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await (await database()).collection("codes").replaceOne(
    { _id: `${purpose}:${userId}` },
    { hash: codeHash(purpose, userId, code), attempts: 0, expiresAt: new Date(Date.now() + CODE_LIFETIME_MINUTES * 60_000) },
    { upsert: true },
  );
  return code;
}

// Consumes the code when it matches. A code allows only a few wrong guesses.
export async function useCode(purpose, userId, code) {
  const codes = (await database()).collection("codes");
  const stored = await codes.findOne({ _id: `${purpose}:${userId}` });
  if (!stored || stored.expiresAt < new Date() || stored.attempts >= CODE_ATTEMPTS) {
    throw new HttpError(400, "Код устарел. Запросите новый.");
  }
  if (typeof code !== "string" || !sameText(codeHash(purpose, userId, code.trim()), stored.hash)) {
    await codes.updateOne({ _id: stored._id }, { $inc: { attempts: 1 } });
    throw new HttpError(400, "Неверный код.");
  }
  await codes.deleteOne({ _id: stored._id });
}

export async function sendVerificationCode(user, lang = "ru") {
  const code = await issueCode("verify", user._id);
  await sendEmail(
    user.email,
    tr(lang, "Код подтверждения: {code}", { code }),
    tr(lang, "Здравствуйте!\n\nВаш код для подтверждения почты в приложении «Корзина»: {code}\n\nКод действует {minutes} минут. Если вы не создавали аккаунт, просто проигнорируйте это письмо.", { code, minutes: CODE_LIFETIME_MINUTES }),
  );
}

// Origin of the site, used in links sent to people.
export function appOrigin(request) {
  return process.env.APP_ORIGIN || new URL(request.url).origin;
}
