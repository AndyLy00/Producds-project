// POST /api/register { email, password } -> { token, email }
import { randomUUID } from "node:crypto";
import {
  HttpError,
  assertNotBlocked,
  clientAddress,
  database,
  hashPassword,
  issueToken,
  json,
  parseCredentials,
  preflight,
  readJson,
  recordAttempt,
  route,
} from "./_lib.js";

// Keeps one address from mass-creating accounts or probing which emails are registered.
const WINDOW_SECONDS = 60 * 60;
const MAX_REGISTRATIONS_PER_ADDRESS = 10;

export const OPTIONS = preflight;

export const POST = route(async (request) => {
  const { email, password } = parseCredentials(await readJson(request, 2000));
  const byAddress = `register:ip:${clientAddress(request)}`;
  await assertNotBlocked(byAddress, MAX_REGISTRATIONS_PER_ADDRESS, WINDOW_SECONDS);
  await recordAttempt(byAddress, WINDOW_SECONDS);
  const { salt, hash } = await hashPassword(password);
  const id = randomUUID();
  try {
    await (await database()).collection("users").insertOne({ _id: id, email, passwordSalt: salt, passwordHash: hash, createdAt: new Date() });
  } catch (error) {
    // Duplicate key on the unique email index.
    if (error?.code === 11000) throw new HttpError(409, "Аккаунт с такой почтой уже есть. Войдите в него.");
    throw error;
  }
  return json(201, { token: issueToken(id), email });
});
