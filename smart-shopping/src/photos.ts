// Recipe photos. A photo is shrunk on the device, kept in IndexedDB and shown from there at once;
// while signed in it is uploaded to the account (api/photo.js) as soon as there is a connection,
// so the other devices of the account see it too. A recipe refers to its photo by id only.
import { useEffect, useState } from "react";
import { API_ORIGIN } from "./api-origin";
import { language, t } from "./i18n";

const DB_NAME = "smart-shopping-photos";
const STORE = "photos";
const MAX_SIDE = 1280;
const QUALITY = 0.82;

type StoredPhoto = { id: string; blob: Blob; uploaded: boolean };

export function newPhotoId() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const remotePhotoUrl = (id: string) => `${API_ORIGIN}/api/photo?id=${encodeURIComponent(id)}`;

// --- Shrinking ---------------------------------------------------------------------------------

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    // Honors the EXIF orientation of phone photos.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// A JPEG no larger than MAX_SIDE on its longer side: a phone photo of several megabytes becomes
// about 150–300 KB.
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const image = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error(t("Не удалось обработать фото"));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ("close" in image && typeof image.close === "function") image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error(t("Не удалось обработать фото"));
  return blob;
}

// --- Device storage ----------------------------------------------------------------------------

let opened: Promise<IDBDatabase> | null = null;

function openDb() {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opened = null;
      reject(request.error ?? new Error("IndexedDB is not available"));
    };
  });
  return opened;
}

async function inStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePhoto(id: string, blob: Blob) {
  await inStore("readwrite", (store) => store.put({ id, blob, uploaded: false } satisfies StoredPhoto));
  notifyChanged(id);
}

async function readPhoto(id: string) {
  try {
    return await inStore<StoredPhoto | undefined>("readonly", (store) => store.get(id));
  } catch {
    return undefined;
  }
}

// Drops the device copies of photos no recipe uses any more.
export async function forgetPhotosExcept(used: Set<string>) {
  try {
    const ids = await inStore<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
    for (const id of ids) if (typeof id === "string" && !used.has(id)) await inStore("readwrite", (store) => store.delete(id));
  } catch {
    // Nothing to tidy without storage.
  }
}

// Uploads the photos taken on this device that the account does not have yet. Failures are left
// for the next attempt.
export async function uploadPendingPhotos(token: string) {
  let pending: StoredPhoto[];
  try {
    pending = (await inStore<StoredPhoto[]>("readonly", (store) => store.getAll())).filter((photo) => !photo.uploaded);
  } catch {
    return;
  }
  for (const photo of pending) {
    const response = await fetch(remotePhotoUrl(photo.id), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": photo.blob.type || "image/jpeg", "X-Lang": language() },
      body: photo.blob,
    }).catch(() => null);
    if (!response) return;
    // 4xx other than an expired session will not get better by retrying.
    if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 401)) {
      await inStore("readwrite", (store) => store.put({ ...photo, uploaded: true }));
    }
  }
}

// --- Showing -----------------------------------------------------------------------------------

const listeners = new Set<(id: string) => void>();
function notifyChanged(id: string) {
  for (const listener of listeners) listener(id);
}

// Address to show a photo from: the device copy when there is one, otherwise the account's.
export function usePhoto(id: string | undefined) {
  const [source, setSource] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!id) {
      setSource(undefined);
      return;
    }
    let cancelled = false;
    let objectUrl: string | undefined;
    const load = async () => {
      const local = await readPhoto(id);
      if (cancelled) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = local ? URL.createObjectURL(local.blob) : undefined;
      setSource(objectUrl ?? remotePhotoUrl(id));
    };
    void load();
    const listener = (changed: string) => { if (changed === id) void load(); };
    listeners.add(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return source;
}
