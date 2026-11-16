// POST /api/login { email, password } -> { token, email }
import { HttpError, database, issueToken, json, parseCredentials, passwordMatches, preflight, readJson, route } from "./_lib.js";

export const OPTIONS = preflight;

export const POST = route(async (request) => {
  const { email, password } = parseCredentials(await readJson(request, 2000));
  const user = await (await database()).collection("users").findOne({ email });
  // The same answer for an unknown email and a wrong password, so accounts cannot be probed.
  if (!user || !(await passwordMatches(password, user))) throw new HttpError(401, "Неверная почта или пароль.");
  return json(200, { token: issueToken(user._id), email });
});
