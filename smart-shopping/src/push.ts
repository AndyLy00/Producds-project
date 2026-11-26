// Push notifications of the Android app (Firebase Cloud Messaging, server side: api/_push.js),
// so that family news reaches the phone even when the app is closed.
//
// Only builds made with the Firebase project's google-services.json can receive them
// (PUSH_ENABLED=1, see vite.android.config.ts and .github/workflows/android.yml); without it the
// Firebase SDK is not set up, and registering would fail, so nothing here runs.
import { Capacitor } from "@capacitor/core";
import { t } from "./i18n";

declare const __PUSH_ENABLED__: boolean;

export const pushSupported = typeof __PUSH_ENABLED__ === "boolean" && __PUSH_ENABLED__ && Capacitor.getPlatform() === "android";

const TOKEN_KEY = "smart-shopping.push-token";
let active = false;
let listening: Promise<void> | null = null;

// Whether this phone gets the account's news by push: the app then does not repeat it with a
// notification of its own (src/device.ts, notifyNow).
export const pushActive = () => active;

export function savedPushToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Asks for permission and registers the phone; `register` sends the token to the account.
// `openList` handles a tapped notification.
export async function startPush(register: (token: string) => Promise<boolean>, openList: (listId: string) => void) {
  if (!pushSupported) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  try {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") return;
    listening ??= (async () => {
      await PushNotifications.createChannel({
        id: "family",
        name: t("Семья"),
        description: t("Кого отправили в магазин и когда покупки сделаны"),
        importance: 4,
        visibility: 1,
        vibration: true,
      });
      await PushNotifications.addListener("registration", ({ value }) => {
        try {
          localStorage.setItem(TOKEN_KEY, value);
        } catch {
          // The token is asked for again next time.
        }
        void register(value).then((enabled) => { active = enabled; }, () => undefined);
      });
      await PushNotifications.addListener("registrationError", (error) => console.warn("Push registration failed", error));
      await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const listId = (notification.data as { listId?: string } | undefined)?.listId;
        if (listId) openList(listId);
      });
    })();
    await listening;
    await PushNotifications.register();
  } catch (error) {
    console.warn("Push notifications are not available", error);
  }
}

// Signing out: the token is given up, so the account's news stops coming to this phone.
export function forgetPushToken() {
  active = false;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to forget.
  }
}
