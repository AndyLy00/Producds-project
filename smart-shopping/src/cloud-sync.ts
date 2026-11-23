// Account and cloud copy of the data (server side: api/*.js, stored in MongoDB).
// The app always works from the on-device copy. While signed in, local changes are sent to the
// account shortly after they are made, and the account is checked for changes from other devices
// and from people sharing a list every few seconds while the app is open. Both copies are merged
// per entity (model.ts, shared/merge.js), so edits made on several devices at once are all kept.
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { API_ORIGIN } from "./api-origin";
import { uploadPendingPhotos } from "./photos";
import { isDemoList, mergeData, profileOf, type ShoppingData, type ShoppingList, type Profile, type Sharing } from "./model";

const SESSION_KEY = "smart-shopping.account.v2";
const VERIFIER_KEY = "smart-shopping.google-verifier";
const PUSH_DELAY = 700;
const POLL_INTERVAL = 5000;

type Session = { email: string; token: string; verified: boolean; hasPassword: boolean; since: number };
type AccountResponse = Omit<Session, "since">;
type SyncResponse = { lists: ShoppingList[]; profile: Profile; sharing: Sharing; revoked: string[]; familySize?: number; now: number };
export type SyncStatus = "idle" | "syncing" | "synced" | "error";
export type AuthConfig = { googleClientId: string | null; email: boolean };
export type Member = { email: string; owner: boolean; you: boolean };
export type Family = { members: Member[]; owner: boolean };
export type FamilyInvite = { from: string | null; members: number; already: boolean };

export { API_ORIGIN };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Нет связи с сервером. Проверьте интернет.");
  }
  const result = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new ApiError(response.status, result?.error ?? "Сервер временно недоступен. Попробуйте позже.");
  return result as T;
}

function readSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return value && typeof value.token === "string" ? { ...value, since: Number(value.since) || 0 } : null;
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

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function useCloudSync(
  data: ShoppingData,
  setData: Dispatch<SetStateAction<ShoppingData>>,
  ready: boolean,
  notify: (message: string) => void,
) {
  const [session, setSession] = useState<Session | null>(readSession);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [config, setConfig] = useState<AuthConfig>({ googleClientId: null, email: false });
  const [dirtyTick, setDirtyTick] = useState(0);
  const sessionRef = useRef(session);
  const dataRef = useRef(data);
  dataRef.current = data;
  const dirtyRef = useRef(false);
  const [familySize, setFamilySize] = useState(1);
  // Sync steps run one after another so that two exchanges never race each other.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const updateSession = useCallback((next: Session | null) => {
    sessionRef.current = next;
    writeSession(next);
    setSession(next);
  }, []);

  useEffect(() => {
    api<AuthConfig>("/api/auth").then(setConfig, () => undefined);
  }, []);

  const exchange = useCallback(async (current: Session) => {
    // Everything is sent after a local change and on the first exchange of a session; otherwise
    // the app only asks what changed.
    const full = dirtyRef.current || current.since === 0;
    dirtyRef.current = false;
    const sent = dataRef.current;
    // Photos first, so that the recipes sent below never point at a photo the server lacks.
    await uploadPendingPhotos(current.token);
    try {
      const result = await api<SyncResponse>(
        "/api/sync",
        {
          lists: full ? sent.lists.filter((list) => !isDemoList(list)) : [],
          // Every list on the device, so the server can say which ones the account lost (it
          // left a shared list or the family) even when nothing is sent.
          known: full ? [] : sent.lists.filter((list) => !isDemoList(list)).map((list) => list.id),
          profile: full ? profileOf(sent) : null,
          since: current.since,
        },
        current.token,
      );
      // On the first exchange with an account that has lists, the untouched demo lists give way.
      const dropDemo = current.since === 0 && result.lists.some((list) => !list.deleted);
      setData((previous) => mergeData(dropDemo ? { ...previous, lists: previous.lists.filter((list) => !isDemoList(list)) } : previous, result));
      const latest = sessionRef.current;
      if (latest?.token === current.token) updateSession({ ...latest, since: result.now });
      setFamilySize(result.familySize ?? 1);
    } catch (error) {
      if (full) dirtyRef.current = true;
      throw error;
    }
  }, [setData, updateSession]);

  const enqueue = useCallback(<T,>(step: (current: Session) => Promise<T>, quiet = false) => {
    const run = queueRef.current.then(async () => {
      const current = sessionRef.current;
      if (!current) throw new ApiError(401, "Войдите в аккаунт.");
      if (!quiet) setStatus("syncing");
      try {
        const result = await step(current);
        setStatus("synced");
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && sessionRef.current?.token === current.token) {
          updateSession(null);
          setStatus("idle");
          notify("Сессия истекла. Войдите в аккаунт заново.");
        } else if (error instanceof ApiError && error.status === 0) {
          setStatus("error");
        }
        throw error;
      }
    });
    queueRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, [notify, updateSession]);

  const sync = useCallback((quiet = false) => enqueue(exchange, quiet).catch(() => undefined), [enqueue, exchange]);

  // Called by the app after every change the user makes.
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirtyTick((tick) => tick + 1);
  }, []);

  const signedIn = session !== null;
  const token = session?.token;

  useEffect(() => {
    if (!ready || !signedIn || !dirtyRef.current) return;
    const timer = window.setTimeout(() => void sync(), PUSH_DELAY);
    return () => window.clearTimeout(timer);
  }, [dirtyTick, ready, signedIn, sync]);

  // Near-real-time updates: check often while the app is on screen, at once when it comes back.
  useEffect(() => {
    if (!ready || !token) return;
    const check = () => {
      if (document.visibilityState === "visible") void sync(true);
    };
    check();
    const timer = window.setInterval(check, POLL_INTERVAL);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [ready, token, sync]);

  // Picks up an email address confirmed or a password set from another device.
  useEffect(() => {
    if (!token) return;
    api<AccountResponse>("/api/auth", { action: "me" }, token).then((me) => {
      const latest = sessionRef.current;
      if (latest?.token === token) updateSession({ ...latest, verified: me.verified, hasPassword: me.hasPassword, email: me.email });
    }, () => undefined);
  }, [token, updateSession]);

  const startSession = useCallback((account: AccountResponse, keepSince = false) => {
    updateSession({ ...account, since: keepSince ? (sessionRef.current?.since ?? 0) : 0 });
    if (!keepSince) {
      // The first exchange merges this device's lists with the account's.
      dirtyRef.current = true;
      setDirtyTick((tick) => tick + 1);
    }
  }, [updateSession]);

  const authed = useCallback(<T,>(body: Record<string, unknown>) => {
    const current = sessionRef.current;
    if (!current) return Promise.reject(new ApiError(401, "Войдите в аккаунт."));
    return api<T>("/api/auth", body, current.token);
  }, []);

  const signOut = useCallback(() => {
    updateSession(null);
    setStatus("idle");
    setData((previous) => ({ ...previous, sharing: {} }));
  }, [setData, updateSession]);

  const account = {
    signIn: async (mode: "login" | "register", email: string, password: string) =>
      startSession(await api<AccountResponse>("/api/auth", { action: mode, email, password })),
    verifyEmail: async (code: string) => startSession(await authed<AccountResponse>({ action: "verify-email", code }), true),
    resendVerification: () => authed({ action: "resend-verification" }),
    forgotPassword: (email: string) => api("/api/auth", { action: "forgot", email }),
    resetPassword: async (email: string, code: string, password: string) =>
      startSession(await api<AccountResponse>("/api/auth", { action: "reset", email, code, password })),
    changePassword: async (current: string, password: string) =>
      startSession(await authed<AccountResponse>({ action: "change-password", current, password }), true),
    deleteAccount: async (password: string) => {
      await authed({ action: "delete-account", password });
      signOut();
    },
    googleCredential: async (credential: string) => startSession(await api<AccountResponse>("/api/auth", { action: "google", credential })),
    // Android: Google sign-in happens in the browser (see native/app-login.tsx), which hands back
    // a one-time code that only this device can redeem with the verifier it keeps.
    startAppGoogleLogin: async () => {
      const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
      localStorage.setItem(VERIFIER_KEY, verifier);
      window.location.assign(`${API_ORIGIN}/?app-login=${base64url(digest)}`);
    },
    finishAppGoogleLogin: async (code: string) => {
      const verifier = localStorage.getItem(VERIFIER_KEY);
      if (!verifier) throw new ApiError(400, "Вход не завершён. Попробуйте ещё раз.");
      localStorage.removeItem(VERIFIER_KEY);
      startSession(await api<AccountResponse>("/api/auth", { action: "google-handoff", code, verifier }));
    },
    signOut,
  };

  // The family's lists are all shared (api/_family.js). Joining or leaving changes which lists
  // the account sees, so the next exchange starts over and sends everything.
  const [family, setFamily] = useState<Family | null>(null);
  const familyCall = useCallback(<T,>(body: Record<string, unknown>) => enqueue((current) => api<T>("/api/family", body, current.token), true), [enqueue]);
  const refreshFamily = useCallback(() => familyCall<{ family: Family | null }>({ action: "get" }).then((result) => setFamily(result.family), () => undefined), [familyCall]);
  useEffect(() => {
    if (token) void refreshFamily();
    else setFamily(null);
  }, [token, refreshFamily]);
  // Someone joined or left the family on another device: the sync reports the new size.
  useEffect(() => {
    if (token && familySize !== (family?.members.length ?? 1)) void refreshFamily();
  }, [familySize]);
  const resync = useCallback(async () => {
    const latest = sessionRef.current;
    if (latest) updateSession({ ...latest, since: 0 });
    dirtyRef.current = true;
    await sync();
    await refreshFamily();
  }, [sync, refreshFamily, updateSession]);

  const familyActions = {
    invite: (email?: string) => familyCall<{ link: string }>({ action: "invite", email }).then(async (result) => { await refreshFamily(); return result.link; }),
    preview: (token: string) => familyCall<FamilyInvite>({ action: "preview", token }),
    join: async (token: string) => {
      await familyCall({ action: "join", token });
      await resync();
    },
    leave: async () => {
      await familyCall({ action: "leave" });
      await resync();
    },
    remove: async (email: string) => {
      await familyCall({ action: "remove", email });
      await refreshFamily();
      await sync(true);
    },
  };

  const share = {
    // The list must exist on the server before it can be shared.
    invite: async (listId: string, email?: string) => {
      await enqueue(exchange);
      return enqueue((current) => api<{ link: string }>("/api/share", { action: "invite", listId, email }, current.token));
    },
    join: async (token: string) => {
      const joined = await enqueue((current) => api<{ listId: string; name: string }>("/api/share", { action: "join", token }, current.token));
      await sync();
      return joined;
    },
    leave: async (listId: string) => {
      await enqueue((current) => api("/api/share", { action: "leave", listId }, current.token));
      setData((previous) => ({ ...previous, lists: previous.lists.filter((list) => list.id !== listId) }));
    },
    members: (listId: string) =>
      enqueue((current) => api<{ members: Member[] }>("/api/share", { action: "members", listId }, current.token), true).then((result) => result.members),
  };

  return {
    email: session?.email ?? null,
    verified: session?.verified ?? false,
    hasPassword: session?.hasPassword ?? false,
    status,
    config,
    markDirty,
    sync,
    account,
    share,
    family,
    familyActions,
  };
}

export type CloudSync = ReturnType<typeof useCloudSync>;
