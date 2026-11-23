// What the app does with the device: sharing text, reminder and cooking-timer notifications, the Android
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
    // Only reminders: cooking timers (below) have their own range of ids and must survive this.
    const pending = (await LocalNotifications.getPending()).notifications.filter(({ id }) => id < TIMER_IDS);
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map(({ id }) => ({ id })) });
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

// A tapped notification: a list reminder opens the list, a finished timer its recipe.
export function onNotificationOpened(openList: (listId: string) => void, openRecipe: (recipeId: string, stepId?: string) => void) {
  const listener = LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const extra = event.notification.extra as { listId?: string; recipeId?: string; stepId?: string } | undefined;
    if (extra?.listId) openList(extra.listId);
    else if (extra?.recipeId) openRecipe(extra.recipeId, extra.stepId);
  });
  return () => void listener.then((handle) => handle.remove()).catch(() => undefined);
}

// --- Cooking timers ----------------------------------------------------------------------------
// Reminder ids are below 2 000 000 000; timer ids are above, so each kind can be replaced
// without touching the other.
const TIMER_IDS = 2_000_000_000;
const TIMER_CHANNEL = "cooking-timers";
let channelReady: Promise<void> | null = null;

export function timerNotificationId(timerId: string) {
  let hash = 0;
  for (const char of timerId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return TIMER_IDS + (Math.abs(hash) % 100_000_000) + 1;
}

// A loud channel of its own, so that a finished timer is heard in the kitchen even when the
// reminders channel is quiet.
function timerChannel() {
  channelReady ??= LocalNotifications.createChannel({
    id: TIMER_CHANNEL,
    name: "Таймеры готовки",
    description: "Сигнал, когда шаг рецепта готов",
    importance: 5,
    visibility: 1,
    vibration: true,
  }).catch(() => undefined);
  return channelReady;
}

export type TimerAlarm = { id: string; title: string; body: string; at: number; recipeId: string; stepId: string };

// Returns false when the phone may deliver the alarm late (see exactAlarmsAllowed).
export async function scheduleTimerAlarm(alarm: TimerAlarm) {
  if (!isNativeApp) return true;
  try {
    if (!(await allowReminders())) return false;
    await timerChannel();
    const result = await LocalNotifications.schedule({
      notifications: [{
        id: timerNotificationId(alarm.id),
        title: alarm.title,
        body: alarm.body,
        channelId: TIMER_CHANNEL,
        schedule: { at: new Date(alarm.at), allowWhileIdle: true },
        extra: { recipeId: alarm.recipeId, stepId: alarm.stepId },
      }],
    });
    return !result.warning;
  } catch (error) {
    console.warn("Timer notification is not available", error);
    return false;
  }
}

export async function cancelTimerAlarm(timerId: string) {
  if (!isNativeApp) return;
  await LocalNotifications.cancel({ notifications: [{ id: timerNotificationId(timerId) }] }).catch(() => undefined);
}

// Android 14 and later deliver alarms exactly only when the user allows it in the settings;
// otherwise a timer may go off a few minutes late.
export async function exactAlarmsAllowed() {
  if (!isNativeApp || Capacitor.getPlatform() !== "android") return true;
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === "granted";
  } catch {
    return true;
  }
}

export async function openExactAlarmSettings() {
  try {
    return (await LocalNotifications.changeExactNotificationSetting()).exact_alarm === "granted";
  } catch {
    return false;
  }
}

// In the browser (and in the app while it is open) a finished timer also beeps and vibrates.
export function ringTimer() {
  navigator.vibrate?.([400, 200, 400, 200, 400]);
  try {
    const AudioContextClass = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    for (let beep = 0; beep < 3; beep += 1) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, audio.currentTime + beep * 0.45);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + beep * 0.45 + 0.35);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(audio.currentTime + beep * 0.45);
      oscillator.stop(audio.currentTime + beep * 0.45 + 0.4);
    }
    window.setTimeout(() => void audio.close(), 2000);
  } catch {
    // Silence is acceptable.
  }
  if (!isNativeApp && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
    try {
      new Notification("Таймер готовки", { body: "Шаг рецепта готов" });
    } catch {
      // Some mobile browsers only allow notifications from a service worker.
    }
  }
}

// The browser asks once; the answer is remembered by the browser.
export function allowBrowserNotifications() {
  if (!isNativeApp && "Notification" in window && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
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
