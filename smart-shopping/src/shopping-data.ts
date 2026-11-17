// On-device storage of the app's data: IndexedDB, with a copy in localStorage in case IndexedDB is
// unavailable. Shapes and operations: model.ts; the account copy: cloud-sync.ts.
import { migrate, seedData, type ShoppingData } from "./model";

export type { ShoppingData } from "./model";

export interface ShoppingRepository {
  load(): Promise<ShoppingData | null>;
  save(data: ShoppingData): Promise<void>;
}

const storageKey = "smart-shopping.snapshot.v1";

class IndexedShoppingRepository implements ShoppingRepository {
  private database: Promise<IDBDatabase> | null = null;

  private openDatabase() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("IndexedDB недоступна"));
    if (this.database) return this.database;
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open("smart-shopping", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Не удалось открыть локальную базу"));
    });
    return this.database;
  }

  async load() {
    const database = await this.openDatabase();
    return new Promise<ShoppingData | null>((resolve, reject) => {
      const request = database.transaction("snapshots", "readonly").objectStore("snapshots").get("current");
      request.onsuccess = () => resolve(migrate(request.result));
      request.onerror = () => reject(request.error ?? new Error("Не удалось прочитать списки"));
    });
  }

  async save(data: ShoppingData) {
    const database = await this.openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put(data, "current");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Не удалось сохранить списки"));
    });
  }
}

class LocalStorageRepository implements ShoppingRepository {
  async load() {
    try {
      const value = localStorage.getItem(storageKey);
      return value ? migrate(JSON.parse(value)) : null;
    } catch {
      return null;
    }
  }

  async save(data: ShoppingData) {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }
}

class FallbackRepository implements ShoppingRepository {
  constructor(private readonly preferred: ShoppingRepository, private readonly fallback: ShoppingRepository) {}

  async load() {
    try {
      const data = await this.preferred.load();
      if (data) return data;
    } catch {
      // Fall back to the same repository interface when IndexedDB is unavailable.
    }
    return this.fallback.load();
  }

  async save(data: ShoppingData) {
    const writes = await Promise.allSettled([this.preferred.save(data), this.fallback.save(data)]);
    if (writes.every((result) => result.status === "rejected")) throw new Error("Не удалось сохранить данные на устройстве");
  }
}

export const shoppingRepository: ShoppingRepository = new FallbackRepository(new IndexedShoppingRepository(), new LocalStorageRepository());
export const loadShoppingData = () => shoppingRepository.load().then((data) => data ?? seedData());
export const saveShoppingData = (data: ShoppingData) => shoppingRepository.save(data);
