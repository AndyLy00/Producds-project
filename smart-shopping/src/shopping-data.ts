export type ShoppingItem = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  note: string;
  purchased: boolean;
  favorite: boolean;
};

export type ShoppingList = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  items: ShoppingItem[];
};

export type ShoppingData = {
  lists: ShoppingList[];
  history: ShoppingList[];
  darkMode: boolean;
};

export interface ShoppingRepository {
  load(): Promise<ShoppingData | null>;
  save(data: ShoppingData): Promise<void>;
}

const storageKey = "smart-shopping.snapshot.v1";
const seedTime = Date.now();

function seedItem(id: string, name: string, quantity: string, unit: string, category: string, purchased = false, favorite = false, note = ""): ShoppingItem {
  return { id, name, quantity, unit, category, purchased, favorite, note };
}

function seedData(): ShoppingData {
  return {
    darkMode: false,
    history: [],
    lists: [
      {
        id: "weekly-shop",
        name: "Покупки на неделю",
        createdAt: seedTime,
        updatedAt: seedTime,
        items: [
          seedItem("weekly-milk", "Молоко", "1", "л", "Молочные продукты", true, true),
          seedItem("weekly-bread", "Хлеб", "1", "шт.", "Бакалея", true, true),
          seedItem("weekly-apples", "Яблоки", "1", "кг", "Овощи и фрукты", false, true),
          seedItem("weekly-eggs", "Яйца", "10", "шт.", "Молочные продукты"),
          seedItem("weekly-tomatoes", "Помидоры", "500", "г", "Овощи и фрукты"),
          seedItem("weekly-cheese", "Сыр", "200", "г", "Молочные продукты"),
          seedItem("weekly-coffee", "Кофе", "1", "уп.", "Бакалея"),
        ],
      },
      {
        id: "home-shop",
        name: "Покупки для дома",
        createdAt: seedTime - 86400000,
        updatedAt: seedTime - 86400000,
        items: [
          seedItem("home-sponges", "Губки для посуды", "1", "уп.", "Для дома", true),
          seedItem("home-paper", "Бумажные полотенца", "2", "уп.", "Для дома"),
          seedItem("home-soap", "Жидкое мыло", "1", "шт.", "Для дома"),
          seedItem("home-bags", "Пакеты для мусора", "1", "уп.", "Для дома"),
        ],
      },
      {
        id: "weekend-shop",
        name: "Выходные",
        createdAt: seedTime - 172800000,
        updatedAt: seedTime - 172800000,
        items: [
          seedItem("weekend-chicken", "Куриное филе", "1", "кг", "Мясо и рыба"),
          seedItem("weekend-potatoes", "Картофель", "2", "кг", "Овощи и фрукты"),
          seedItem("weekend-sour-cream", "Сметана", "1", "шт.", "Молочные продукты"),
        ],
      },
    ],
  };
}

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
      request.onsuccess = () => resolve((request.result as ShoppingData | undefined) ?? null);
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
      return value ? JSON.parse(value) as ShoppingData : null;
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
    const cached = await this.fallback.load();
    if (cached) return cached;
    return seedData();
  }

  async save(data: ShoppingData) {
    const writes = await Promise.allSettled([this.preferred.save(data), this.fallback.save(data)]);
    if (writes.every((result) => result.status === "rejected")) throw new Error("Не удалось сохранить данные на устройстве");
  }
}

export const shoppingRepository: ShoppingRepository = new FallbackRepository(new IndexedShoppingRepository(), new LocalStorageRepository());
export const loadShoppingData = () => shoppingRepository.load().then((data) => data ?? seedData());
export const saveShoppingData = (data: ShoppingData) => shoppingRepository.save(data);
