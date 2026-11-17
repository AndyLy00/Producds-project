// What the app does with the device: sharing text, reminder notifications, the Android
// home-screen widget, and Google's sign-in button on the web.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { alive, progress, type ShoppingList } from "./model";

export const isNativeApp = Capacitor.isNativePlatform();

export async function shareText(title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (isNativeApp) {
      await Share.share({ title, text, dialogTitle: "Отправить список" });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ title, text });
      return "shared";
    }
  } catch (error) {
    // Closing the share sheet without choosing an app is not an error.
    if (error instanceof Error && /cancel|abort/i.test(`${error.name} ${error.message}`)) return "shared";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

// --- Reminders ---------------------------------------------------------------------------------

function notificationId(listId: string) {
  let hash = 0;
  for (const char of listId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 2_000_000_000 || 1;
}

export async function allowReminders() {
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    return (await LocalNotifications.requestPermissions()).display === "granted";
  } catch {
    return false;
  }
}

// Schedules exactly the reminders of the given lists, replacing whatever was scheduled before.
export async function scheduleReminders(lists: ShoppingList[]) {
  try {
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) });
    const due = lists.filter((list) => !list.deleted && !list.completedAt && list.remindAt && list.remindAt > Date.now());
    if (!due.length) return;
    await LocalNotifications.schedule({
      notifications: due.map((list) => ({
        id: notificationId(list.id),
        title: "Пора за покупками",
        body: progress(list).left ? `${list.name}: осталось купить ${progress(list).left}` : list.name,
        schedule: { at: new Date(list.remindAt!), allowWhileIdle: true },
        extra: { listId: list.id },
      })),
    });
  } catch (error) {
    console.warn("Reminders are not available", error);
  }
}

export function onReminderOpened(open: (listId: string) => void) {
  const listener = LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const listId = (event.notification.extra as { listId?: string } | undefined)?.listId;
    if (listId) open(listId);
  });
  return () => void listener.then((handle) => handle.remove()).catch(() => undefined);
}

// --- Android widget ----------------------------------------------------------------------------

type AppWindowBridge = { setWidget?: (json: string) => void };

// Shows the list on the home-screen widget (ListWidgetProvider.java).
export function updateWidget(list: ShoppingList | undefined) {
  const bridge = (window as { AppWindow?: AppWindowBridge }).AppWindow;
  if (!bridge?.setWidget) return;
  const items = list ? alive(list.items).filter((item) => !item.purchased) : [];
  bridge.setWidget(
    JSON.stringify({
      title: list?.name ?? "Корзина",
      subtitle: list ? (items.length ? `Осталось купить: ${items.length}` : "Всё куплено") : "Нет списков",
      items: items.slice(0, 12).map((item) => `${item.name} — ${item.quantity} ${item.unit}`),
    }),
  );
}

// --- Google Identity Services (web) ------------------------------------------------------------

type GoogleIdentity = {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: string }): void;
      renderButton(element: HTMLElement, options: Record<string, unknown>): void;
    };
  };
};

let googleScript: Promise<GoogleIdentity> | null = null;

function loadGoogle() {
  googleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve((window as unknown as { google: GoogleIdentity }).google);
    script.onerror = () => {
      googleScript = null;
      reject(new Error("Google недоступен"));
    };
    document.head.append(script);
  });
  return googleScript;
}

export async function renderGoogleButton(element: HTMLElement, clientId: string, onCredential: (credential: string) => void) {
  const google = await loadGoogle();
  google.accounts.id.initialize({ client_id: clientId, callback: (response) => onCredential(response.credential) });
  google.accounts.id.renderButton(element, { theme: "outline", size: "large", shape: "pill", text: "continue_with", locale: "ru", width: 280 });
}
