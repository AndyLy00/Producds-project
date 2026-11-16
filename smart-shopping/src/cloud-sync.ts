// Account and cloud copy of the lists (server side: api/*.js, stored in MongoDB).
// The app keeps working from the on-device copy; while signed in, every change is also saved
// to the account and changes made on other devices are picked up when the app is opened.
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ShoppingData } from "./shopping-data";

// Absolute because the Android app is not served from this origin. VITE_API_ORIGIN points a
// local build at another server.
const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? "https://korzina-peach.vercel.app";
const SESSION_KEY = "smart-shopping.account.v1";
const PUSH_DELAY = 1000;

type Session = { email: string; token: string; version: number };
type Remote = { version: number; data: ShoppingData | null };
export type SyncStatus = "idle" | "syncing" | "synced" | "error";

class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body: unknown) {
    super(message);
  }
}

async function api<T>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "Нет связи с сервером. Проверьте интернет.", null);
  }
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new ApiError(response.status, body?.error ?? "Сервер временно недоступен. Попробуйте позже.", body);
  return body as T;
}

function readSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return value && typeof value.token === "string" && typeof value.email === "string" ? { ...value, version: Number(value.version) || 0 } : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Without storage the user simply has to sign in again next time.
  }
}

// The same shape and key order the server stores, so snapshots can be compared as strings.
function serialize(data: ShoppingData) {
  return JSON.stringify({ lists: data.lists, history: data.history, darkMode: data.darkMode });
}

export function useCloudSync(
  data: ShoppingData,
  setData: Dispatch<SetStateAction<ShoppingData>>,
  ready: boolean,
  notify: (message: string) => void,
) {
  const [session, setSession] = useState<Session | null>(readSession);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const sessionRef = useRef(session);
  const dataRef = useRef(data);
  dataRef.current = data;
  // Snapshot known to be stored in the account; null until the first exchange after start.
  const syncedRef = useRef<string | null>(null);
  // Sync steps run one after another so that two saves never race each other.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const updateSession = useCallback((next: Session | null) => {
    sessionRef.current = next;
    writeSession(next);
    setSession(next);
  }, []);

  const adopt = useCallback((remote: Remote & { data: ShoppingData }) => {
    syncedRef.current = serialize(remote.data);
    if (sessionRef.current) updateSession({ ...sessionRef.current, version: remote.version });
    setData(remote.data);
  }, [setData, updateSession]);

  const push = useCallback(async (current: Session, retried = false): Promise<void> => {
    const snapshot = serialize(dataRef.current);
    try {
      const saved = await api<{ version: number }>("/api/data", {
        method: "PUT",
        token: current.token,
        body: { baseVersion: current.version, data: JSON.parse(snapshot) },
      });
      syncedRef.current = snapshot;
      updateSession({ ...current, version: saved.version });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      const remote = error.body as Remote;
      if (remote.data) {
        adopt(remote as Remote & { data: ShoppingData });
        notify("Списки обновлены с другого устройства");
      } else if (!retried) {
        // Nothing is stored for the account (any more): start it from this device's lists.
        await push({ ...current, version: 0 }, true);
      } else {
        throw error;
      }
    }
  }, [adopt, notify, updateSession]);

  const pull = useCallback(async (current: Session) => {
    const remote = await api<Remote>("/api/data", { token: current.token });
    if (!remote.data) return push({ ...current, version: 0 });
    if (remote.version !== current.version) return adopt(remote as Remote & { data: ShoppingData });
    if (serialize(remote.data) === serialize(dataRef.current)) syncedRef.current = serialize(remote.data);
    else await push(current);
  }, [adopt, push]);

  const enqueue = useCallback((step: (current: Session) => Promise<void>) => {
    const run = queueRef.current.then(async () => {
      const current = sessionRef.current;
      if (!current) return;
      setStatus("syncing");
      try {
        await step(current);
        setStatus("synced");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          updateSession(null);
          setStatus("idle");
          notify("Сессия истекла. Войдите в аккаунт заново.");
        } else {
          setStatus("error");
        }
      }
    });
    queueRef.current = run;
    return run;
  }, [notify, updateSession]);

  // Catch up with the account when the app starts and whenever it comes back to the foreground.
  const signedIn = session !== null;
  useEffect(() => {
    if (!ready || !signedIn) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void enqueue(pull);
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [ready, signedIn, enqueue, pull]);

  // Save changes shortly after they are made.
  useEffect(() => {
    if (!ready || !signedIn) return;
    const timer = window.setTimeout(() => {
      void enqueue(async (current) => {
        if (syncedRef.current !== null && syncedRef.current !== serialize(dataRef.current)) await push(current);
      });
    }, PUSH_DELAY);
    return () => window.clearTimeout(timer);
  }, [data, ready, signedIn, enqueue, push]);

  // Rejects with a message for the user when the credentials are not accepted.
  const signIn = useCallback(async (mode: "login" | "register", email: string, password: string) => {
    const account = await api<{ token: string; email: string }>(`/api/${mode}`, { method: "POST", body: { email, password } });
    syncedRef.current = null;
    // Version 0 makes the first exchange take the account's lists if it has any, and
    // otherwise start the account from the lists on this device.
    updateSession({ email: account.email, token: account.token, version: 0 });
  }, [updateSession]);

  const signOut = useCallback(() => {
    syncedRef.current = null;
    updateSession(null);
    setStatus("idle");
  }, [updateSession]);

  return { email: session?.email ?? null, status, signIn, signOut };
}
