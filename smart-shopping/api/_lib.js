// Shared code of the Vercel functions in this folder: MongoDB access, passwords, session tokens.
// Files starting with "_" are not exposed as routes.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { MongoClient } from "mongodb";

const scryptAsync = promisify(scrypt);
const TOKEN_LIFETIME_SECONDS = 180 * 24 * 60 * 60;

// The web app is served from the same origin, but the Android app calls from its own
// (https://localhost). Sessions travel in the Authorization header, not in cookies, so any
// origin may be allowed.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
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

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Turns thrown HttpErrors into JSON responses; anything else is a 500 whose details stay in the log.
export function route(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError) return json(error.status, { error: error.message });
      console.error(error);
      return json(500, { error: "Сервер временно недоступен. Попробуйте позже." });
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

// Throws 429 when the subject has used up its attempts for the current window.
export async function assertNotBlocked(subject, limit, windowSeconds) {
  const { _id, expiresAt } = attemptCounter(subject, windowSeconds);
  const counter = await (await database()).collection("attempts").findOne({ _id });
  if ((counter?.count ?? 0) < limit) return;
  const minutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));
  throw new HttpError(429, `Слишком много попыток. Попробуйте снова через ${minutes} мин.`);
}

export async function recordAttempt(subject, windowSeconds) {
  const { _id, expiresAt } = attemptCounter(subject, windowSeconds);
  await (await database()).collection("attempts").updateOne({ _id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true });
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

// Compact signed token: base64url(JSON payload) + "." + HMAC-SHA256 signature.
export function issueToken(userId) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function authenticatedUserId(request) {
  const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  const [payload, signature] = token.split(".");
  if (payload && signature) {
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      try {
        const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
        if (typeof sub === "string" && exp > Date.now() / 1000) return sub;
      } catch {
        // Reported below.
      }
    }
  }
  throw new HttpError(401, "Войдите в аккаунт заново.");
}

export function parseCredentials(body) {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Укажите корректный адрес почты.");
  if (password.length < 8) throw new HttpError(400, "Пароль должен быть не короче 8 символов.");
  if (password.length > 200) throw new HttpError(400, "Слишком длинный пароль.");
  return { email, password };
}
