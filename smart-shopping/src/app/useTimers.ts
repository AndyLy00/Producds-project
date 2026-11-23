// Cooking timers. A timer stores when it ends, not how much is left, so it keeps counting while
// the app is closed and after the phone restarts; the system notification (device.ts) rings
// even then. Timers belong to this device and are not synced.
import { useEffect, useRef, useState } from "react";
import { cancelTimerAlarm, ringTimer, scheduleTimerAlarm } from "../device";
import { createId, type Recipe, type RecipeStep } from "../model";
import { t } from "../i18n";

const STORAGE_KEY = "smart-shopping.timers.v1";

export type CookingTimer = { id: string; recipeId: string; stepId: string; label: string; endsAt: number; minutes: number; rang?: boolean };

function readTimers(): CookingTimer[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((timer) => timer && typeof timer.endsAt === "number") : [];
  } catch {
    return [];
  }
}

function writeTimers(timers: CookingTimer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
  } catch {
    // Without storage the timers last as long as the app stays open.
  }
}

export function formatCountdown(milliseconds: number) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function useTimers(onRing: (timer: CookingTimer) => void) {
  const [timers, setTimers] = useState<CookingTimer[]>(readTimers);
  const [now, setNow] = useState(Date.now);
  const onRingRef = useRef(onRing);
  onRingRef.current = onRing;

  useEffect(() => writeTimers(timers), [timers]);

  // Ticks once a second while a timer runs.
  const running = timers.some((timer) => !timer.rang);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running]);

  // Rings the timers that have just ended while the app is open.
  useEffect(() => {
    const ended = timers.filter((timer) => !timer.rang && timer.endsAt <= now);
    if (!ended.length) return;
    setTimers((previous) => previous.map((timer) => (ended.some((entry) => entry.id === timer.id) ? { ...timer, rang: true } : timer)));
    // A timer that ended long ago (the app was closed) has already rung as a notification.
    const fresh = ended.filter((timer) => now - timer.endsAt < 60_000);
    if (fresh.length) ringTimer();
    for (const timer of fresh) onRingRef.current(timer);
  }, [now, timers]);

  // Starts the timer of a step; resolves to false when the alarm may come late.
  async function start(recipe: Recipe, step: RecipeStep, index: number) {
    if (!step.minutes) return true;
    const timer: CookingTimer = {
      id: createId(),
      recipeId: recipe.id,
      stepId: step.id,
      label: t("{recipe}, шаг {number}", { recipe: recipe.name, number: index + 1 }),
      endsAt: Date.now() + step.minutes * 60_000,
      minutes: step.minutes,
    };
    const previous = timers.find((entry) => entry.stepId === step.id && entry.recipeId === recipe.id);
    if (previous) void cancelTimerAlarm(previous.id);
    setTimers((current) => [...current.filter((entry) => entry !== previous), timer]);
    setNow(Date.now());
    return scheduleTimerAlarm({ id: timer.id, title: t("Готово: ") + timer.label, body: step.text, at: timer.endsAt, recipeId: recipe.id, stepId: step.id });
  }

  function addMinute(timerId: string) {
    const timer = timers.find((entry) => entry.id === timerId);
    if (!timer) return;
    const endsAt = Math.max(timer.endsAt, Date.now()) + 60_000;
    setTimers((current) => current.map((entry) => (entry.id === timerId ? { ...entry, endsAt, rang: false } : entry)));
    setNow(Date.now());
    void scheduleTimerAlarm({ id: timer.id, title: t("Готово: ") + timer.label, body: t("Ещё минута прошла"), at: endsAt, recipeId: timer.recipeId, stepId: timer.stepId });
  }

  function stop(timerId: string) {
    void cancelTimerAlarm(timerId);
    setTimers((current) => current.filter((entry) => entry.id !== timerId));
  }

  function stopRecipe(recipeId: string) {
    for (const timer of timers) if (timer.recipeId === recipeId) void cancelTimerAlarm(timer.id);
    setTimers((current) => current.filter((entry) => entry.recipeId !== recipeId));
  }

  const forStep = (recipeId: string, stepId: string) => timers.find((timer) => timer.recipeId === recipeId && timer.stepId === stepId);

  return { timers, now, start, addMinute, stop, stopRecipe, forStep };
}

export type Timers = ReturnType<typeof useTimers>;
