// Accounts. GET /api/auth -> what sign-in methods are available.
// POST /api/auth { action, ... } where action is one of the handlers below. Actions that sign in
// answer with account(user): { token, email, verified, hasPassword }.
import { randomUUID } from "node:crypto";
import {
  HttpError,
  account,
  authenticate,
  clearAttempts,
  clientAddress,
  database,
  emailEnabled,
  hashPassword,
  issueCode,
  json,
  parseCredentials,
  parseEmail,
  parsePassword,
  passwordMatches,
  preflight,
  randomToken,
  readJson,
  returnAttempt,
  route,
  sendEmail,
  sendVerificationCode,
  sha256,
  takeAttempt,
  useCode,
} from "./_lib.js";
import { leaveFamily } from "./_family.js";

const MINUTE = 60;
const HOUR = 60 * MINUTE;

const users = async () => (await database()).collection("users");

async function sendVerificationQuietly(user) {
  if (!emailEnabled()) return;
  try {
    await sendVerificationCode(user);
  } catch (error) {
    // The account still works; the user can ask for the code again from Settings.
    console.error(error);
  }
}

// Wrong passwords of one account (guessing it) and of one address (trying many accounts).
async function checkPasswordAttempt(request, email, user, password) {
  const byEmail = `login:email:${email}`;
  const byAddress = `login:ip:${clientAddress(request)}`;
  // Every attempt is counted before the password is checked, so a blocked attacker learns
  // nothing even from a correct guess; a correct password then gives its attempt back.
  await takeAttempt(byEmail, 5, 15 * MINUTE);
  await takeAttempt(byAddress, 30, 15 * MINUTE);
  if (!user?.passwordHash || !(await passwordMatches(password, user))) return false;
  await Promise.all([clearAttempts(byEmail, 15 * MINUTE), returnAttempt(byAddress, 15 * MINUTE)]);
  return true;
}

async function setPassword(user, password) {
  const { salt, hash } = await hashPassword(password);
  const tokenVersion = (user.tokenVersion ?? 0) + 1;
  await (await users()).updateOne({ _id: user._id }, { $set: { passwordSalt: salt, passwordHash: hash, tokenVersion } });
  return { ...user, passwordSalt: salt, passwordHash: hash, tokenVersion };
}

async function verifyGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(503, "Вход через Google пока не настроен.");
  if (typeof credential !== "string" || credential.length > 5000) throw new HttpError(400, "Некорректный запрос.");
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const claims = response.ok ? await response.json() : null;
  const valid =
    claims &&
    claims.aud === clientId &&
    ["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) &&
    String(claims.email_verified) === "true" &&
    Number(claims.exp) > Date.now() / 1000;
  if (!valid) throw new HttpError(401, "Google не подтвердил вход. Попробуйте ещё раз.");
  return { googleId: claims.sub, email: parseEmail(claims.email) };
}

const actions = {
  async register(request, body) {
    const { email, password } = parseCredentials(body);
    // Keeps one address from mass-creating accounts or probing which emails are registered.
    await takeAttempt(`register:ip:${clientAddress(request)}`, 10, HOUR);
    const { salt, hash } = await hashPassword(password);
    const user = { _id: randomUUID(), email, passwordSalt: salt, passwordHash: hash, emailVerified: false, tokenVersion: 0, createdAt: new Date() };
    try {
      await (await users()).insertOne(user);
    } catch (error) {
      if (error?.code === 11000) throw new HttpError(409, "Аккаунт с такой почтой уже есть. Войдите в него.");
      throw error;
    }
    await sendVerificationQuietly(user);
    return json(201, account(user));
  },

  async login(request, body) {
    const { email, password } = parseCredentials(body);
    const user = await (await users()).findOne({ email });
    // The same answer for an unknown email and a wrong password, so accounts cannot be probed.
    if (!(await checkPasswordAttempt(request, email, user, password))) throw new HttpError(401, "Неверная почта или пароль.");
    return json(200, account(user));
  },

  async me(request) {
    const { token, ...profile } = account(await authenticate(request));
    return json(200, profile);
  },

  async "verify-email"(request, body) {
    const user = await authenticate(request);
    if (!user.emailVerified) {
      await useCode("verify", user._id, body.code);
      await (await users()).updateOne({ _id: user._id }, { $set: { emailVerified: true } });
    }
    return json(200, account({ ...user, emailVerified: true }));
  },

  async "resend-verification"(request) {
    const user = await authenticate(request);
    if (user.emailVerified) return json(200, { ok: true });
    await takeAttempt(`verify:${user._id}`, 5, HOUR);
    await sendVerificationCode(user);
    return json(200, { ok: true });
  },

  async forgot(request, body) {
    const email = parseEmail(body.email);
    if (!emailEnabled()) throw new HttpError(503, "Отправка писем пока не настроена.");
    await takeAttempt(`forgot:email:${email}`, 5, HOUR);
    await takeAttempt(`forgot:ip:${clientAddress(request)}`, 20, HOUR);
    const user = await (await users()).findOne({ email });
    // The same answer whether or not the account exists.
    if (user) {
      const code = await issueCode("reset", user._id);
      await sendEmail(
        email,
        `Код для сброса пароля: ${code}`,
        `Здравствуйте!\n\nКто-то запросил сброс пароля для аккаунта «Корзины» с этой почтой. Код: ${code}\n\nКод действует 15 минут. Если это были не вы, просто проигнорируйте письмо — пароль останется прежним.`,
      );
    }
    return json(200, { ok: true });
  },

  async reset(request, body) {
    const email = parseEmail(body.email);
    const password = parsePassword(body.password);
    const user = await (await users()).findOne({ email });
    if (!user) throw new HttpError(400, "Код устарел. Запросите новый.");
    await useCode("reset", user._id, body.code);
    // The code came by email, so the address is confirmed as well.
    await (await users()).updateOne({ _id: user._id }, { $set: { emailVerified: true } });
    await clearAttempts(`login:email:${email}`, 15 * MINUTE);
    return json(200, account(await setPassword({ ...user, emailVerified: true }, password)));
  },

  async "change-password"(request, body) {
    const user = await authenticate(request);
    const password = parsePassword(body.password);
    if (user.passwordHash && !(await checkPasswordAttempt(request, user.email, user, String(body.current ?? "")))) {
      throw new HttpError(400, "Текущий пароль указан неверно.");
    }
    return json(200, account(await setPassword(user, password)));
  },

  async "delete-account"(request, body) {
    const user = await authenticate(request);
    if (user.passwordHash && !(await checkPasswordAttempt(request, user.email, user, String(body.password ?? "")))) {
      throw new HttpError(400, "Пароль указан неверно.");
    }
    const db = await database();
    await leaveFamily(db, user._id);
    await db.collection("lists").updateMany({ members: user._id }, { $pull: { members: user._id }, $set: { serverUpdatedAt: Date.now() } });
    await Promise.all([
      db.collection("lists").deleteMany({ members: { $size: 0 } }),
      db.collection("profiles").deleteOne({ _id: user._id }),
      db.collection("photos").deleteMany({ owner: user._id }),
      db.collection("codes").deleteMany({ _id: { $in: [`verify:${user._id}`, `reset:${user._id}`] } }),
      db.collection("users").deleteOne({ _id: user._id }),
    ]);
    return json(200, { ok: true });
  },

  // { credential } from Google Identity Services. With { challenge } (sign-in for the Android app,
  // done in the browser) it answers with a one-time code that only the holder of the challenge's
  // verifier can exchange for a session (see "google-handoff").
  async google(request, body) {
    const { googleId, email } = await verifyGoogleCredential(body.credential);
    const collection = await users();
    let user = (await collection.findOne({ googleId })) ?? (await collection.findOne({ email }));
    if (user && !user.emailVerified && user.googleId !== googleId) {
      // The account was registered with this address but the address was never confirmed, so
      // whoever registered it may not own the mailbox. Google has just proved who does: the
      // password set by the registrant is dropped and every existing session ends.
      const tokenVersion = (user.tokenVersion ?? 0) + 1;
      await collection.updateOne({ _id: user._id }, { $set: { googleId, emailVerified: true, tokenVersion }, $unset: { passwordHash: "", passwordSalt: "" } });
      const { passwordHash, passwordSalt, ...rest } = user;
      user = { ...rest, googleId, emailVerified: true, tokenVersion };
    } else if (user) {
      await collection.updateOne({ _id: user._id }, { $set: { googleId, emailVerified: true } });
      user = { ...user, googleId, emailVerified: true };
    } else {
      user = { _id: randomUUID(), email, googleId, emailVerified: true, tokenVersion: 0, createdAt: new Date() };
      await collection.insertOne(user);
    }
    if (typeof body.challenge !== "string") return json(200, account(user));
    if (body.challenge.length < 40 || body.challenge.length > 100) throw new HttpError(400, "Некорректный запрос.");
    const code = randomToken();
    await (await database()).collection("handoffs").insertOne({ _id: code, userId: user._id, challenge: body.challenge, expiresAt: new Date(Date.now() + 3 * 60_000) });
    return json(200, { code });
  },

  async "google-handoff"(request, body) {
    if (typeof body.code !== "string" || typeof body.verifier !== "string") throw new HttpError(400, "Некорректный запрос.");
    const handoff = await (await database()).collection("handoffs").findOneAndDelete({ _id: body.code });
    if (!handoff || handoff.expiresAt < new Date() || handoff.challenge !== sha256(body.verifier)) {
      throw new HttpError(400, "Вход не завершён. Попробуйте ещё раз.");
    }
    const user = await (await users()).findOne({ _id: handoff.userId });
    if (!user) throw new HttpError(400, "Вход не завершён. Попробуйте ещё раз.");
    return json(200, account(user));
  },
};

export const OPTIONS = preflight;

export const GET = route(async () => json(200, { googleClientId: process.env.GOOGLE_CLIENT_ID || null, email: emailEnabled() }));

export const POST = route(async (request) => {
  const body = await readJson(request, 10_000);
  const handler = Object.hasOwn(actions, body.action) ? actions[body.action] : null;
  if (!handler) throw new HttpError(400, "Некорректный запрос.");
  return handler(request, body);
});
