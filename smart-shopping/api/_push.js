// Push notifications to the Android app through Firebase Cloud Messaging (HTTP v1 API), so
// family news reaches a phone even when the app is closed.
//
// FIREBASE_SERVICE_ACCOUNT holds the service account key of the Firebase project (its JSON, or
// that JSON in base64). Without it nothing is sent and everything else works as before.
// The app registers its device token with { action: "push-register" } (api/auth.js); a token
// that Firebase no longer knows is forgotten.
import { createSign } from "node:crypto";
import { tr } from "./_i18n.js";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// A device that has not opened the app for this long is forgotten (api/_lib.js, TTL index).
export const DEVICE_LIFETIME_DAYS = 120;
export const MAX_DEVICES = 10;

let cachedAccount;
function serviceAccount() {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  cachedAccount = null;
  if (raw) {
    try {
      const account = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
      if (account.client_email && account.private_key && account.project_id) cachedAccount = account;
    } catch {
      console.warn("FIREBASE_SERVICE_ACCOUNT is not a service account key");
    }
  }
  return cachedAccount;
}

export const pushEnabled = () => serviceAccount() !== null;

let accessToken = { value: "", expiresAt: 0 };

// An OAuth access token for FCM, signed with the service account's key (RFC 7523).
async function token(account) {
  if (accessToken.expiresAt > Date.now() + 60_000) return accessToken.value;
  const now = Math.floor(Date.now() / 1000);
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) throw new Error(`FCM token: ${response.status}`);
  const result = await response.json();
  accessToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  return accessToken.value;
}

// Sends `title` and `body` (Russian texts, translated to each device's language, see
// api/_i18n.js) to every device of the given accounts. Never throws: a notification that does
// not go out must not break the request that caused it.
export async function sendPush(db, userIds, { title, body, params = {}, data = {} }) {
  const account = serviceAccount();
  if (!account || !userIds.length) return 0;
  try {
    const devices = await db.collection("devices").find({ userId: { $in: userIds } }).toArray();
    if (!devices.length) return 0;
    const bearer = await token(account);
    const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
    const results = await Promise.all(devices.map(async (device) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: device._id,
            notification: { title: tr(device.lang, title, params), body: tr(device.lang, body, params) },
            data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
            android: { priority: "high", notification: { channel_id: "family", icon: "ic_stat_basket", color: "#2f603c" } },
          },
        }),
      }).catch(() => null);
      // 404 UNREGISTERED / 400 INVALID_ARGUMENT for a token: the app was removed or the token is stale.
      if (response && (response.status === 404 || (response.status === 400 && /registration token/i.test(await response.text())))) {
        await db.collection("devices").deleteOne({ _id: device._id });
      }
      return response?.ok ? 1 : 0;
    }));
    return results.reduce((sum, sent) => sum + sent, 0);
  } catch (error) {
    console.warn("Push notifications failed", error);
    return 0;
  }
}
