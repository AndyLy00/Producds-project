// POST /api/register { email, password } -> { token, email }
import { randomUUID } from "node:crypto";
import { HttpError, database, hashPassword, issueToken, json, parseCredentials, preflight, readJson, route } from "./_lib.js";

export const OPTIONS = preflight;

export const POST = route(async (request) => {
  const { email, password } = parseCredentials(await readJson(request, 2000));
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
