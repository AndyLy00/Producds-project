// POST /api/login { email, password } -> { token, email }
import {
  HttpError,
  assertNotBlocked,
  clearAttempts,
  clientAddress,
  database,
  issueToken,
  json,
  parseCredentials,
  passwordMatches,
  preflight,
  readJson,
  recordAttempt,
  route,
} from "./_lib.js";

// Failed sign-ins allowed per 15 minutes: few for one account (guessing its password), more for
// one address (trying one password against many accounts, or several people behind one router).
const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_ADDRESS = 30;

export const OPTIONS = preflight;

export const POST = route(async (request) => {
  const { email, password } = parseCredentials(await readJson(request, 2000));
  const byEmail = `login:email:${email}`;
  const byAddress = `login:ip:${clientAddress(request)}`;
  // Checked before the password, so a blocked attacker learns nothing even from a correct guess.
  await assertNotBlocked(byEmail, MAX_FAILURES_PER_EMAIL, WINDOW_SECONDS);
  await assertNotBlocked(byAddress, MAX_FAILURES_PER_ADDRESS, WINDOW_SECONDS);

  const user = await (await database()).collection("users").findOne({ email });
  if (!user || !(await passwordMatches(password, user))) {
    await Promise.all([recordAttempt(byEmail, WINDOW_SECONDS), recordAttempt(byAddress, WINDOW_SECONDS)]);
    // The same answer for an unknown email and a wrong password, so accounts cannot be probed.
    throw new HttpError(401, "Неверная почта или пароль.");
  }
  await clearAttempts(byEmail, WINDOW_SECONDS);
  return json(200, { token: issueToken(user._id), email });
});
