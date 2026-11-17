// Data of the app and the operations on it that do not depend on the screen.
//
// Everything that syncs between devices is an entity with an `id` and an `updatedAt` set when it
// was last changed on any device; removing an entity leaves a tombstone (`deleted: true`) so the
// removal reaches the other copies. Copies are merged per entity (shared/merge.js), which is why
// every change below stamps exactly the entities it touches.
import { mergeLists, mergeProfile } from "../shared/merge.js";

export const defaultCategories = ["Овощи и фрукты", "Мясо и рыба", "Молочные продукты", "Бакалея", "Напитки", "Для дома", "Сладости и снеки"];
export const units = ["шт.", "кг", "г", "л", "мл", "уп."];

export type Product = { name: string; quantity: string; unit: string; category: string; note: string };

export type ShoppingItem = Product & {
  id: string;
  purchased: boolean;
  favorite: boolean;
  order: number;
  updatedAt: number;
  deleted?: boolean;
};

export type ShoppingList = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  storeId?: string;
  sortMode: "category" | "manual";
  remindAt?: number;
  deleted?: boolean;
  items: ShoppingItem[];
};

export type Store = { id: string; name: string; categoryOrder: string[]; updatedAt: number; deleted?: boolean };
export type Template = { id: string; name: string; items: Product[]; updatedAt: number; deleted?: boolean };
export type Recipe = { id: string; name: string; note: string; ingredients: Product[]; updatedAt: number; deleted?: boolean };
export type Category = { id: string; name: string; updatedAt: number; deleted?: boolean };
export type Settings = { darkMode: boolean; updatedAt: number };
// Received from the server for lists that more than one account has; never edited locally.
export type Sharing = Record<string, { members: number; owner: boolean }>;

export type ShoppingData = {
  lists: ShoppingList[];
  stores: Store[];
  templates: Template[];
  recipes: Recipe[];
  categories: Category[];
  settings: Settings;
  sharing: Sharing;
};

export type Profile = Pick<ShoppingData, "stores" | "templates" | "recipes" | "categories" | "settings">;

export function createId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function alive<T extends { deleted?: boolean }>(entities: T[]) {
  return entities.filter((entity) => !entity.deleted);
}

export function emptyData(): ShoppingData {
  return { lists: [], stores: [], templates: [], recipes: [], categories: [], settings: { darkMode: false, updatedAt: 0 }, sharing: {} };
}

export function profileOf(data: ShoppingData): Profile {
  return { stores: data.stores, templates: data.templates, recipes: data.recipes, categories: data.categories, settings: data.settings };
}

// Combines this device's data with a copy from the server.
export function mergeData(local: ShoppingData, remote: { lists?: ShoppingList[]; profile?: Profile; sharing?: Sharing; revoked?: string[] }): ShoppingData {
  const revoked = new Set(remote.revoked ?? []);
  const lists = mergeLists(local.lists, remote.lists ?? []).filter((list) => !revoked.has(list.id));
  const profile = remote.profile ? mergeProfile(profileOf(local), remote.profile) : profileOf(local);
  return { ...local, ...profile, lists, sharing: remote.sharing ?? local.sharing };
}

export function guessCategory(name: string) {
  const value = name.toLocaleLowerCase("ru");
  const [vegetables, meat, dairy, grocery, drinks, home, sweets] = defaultCategories;
  if (/яблок|помидор|томат|лук|огур|картоф|морков|зелень|капуст|банан|апельс|перец|лимон|груш|чеснок|укроп|петруш/.test(value)) return vegetables;
  if (/кур|мяс|говяд|свин|рыб|фарш|колбас|сосиск|филе|индейк/.test(value)) return meat;
  if (/молок|сыр|яйц|сметан|йогурт|кефир|творог|масло слив|сливк/.test(value)) return dairy;
  if (/вода|сок|чай|кофе|напит|лимонад/.test(value)) return drinks;
  if (/шоколад|печень|снек|конфет|чипс|слад/.test(value)) return sweets;
  if (/моющ|губк|пакет|бумаг|средств|мыло|шампун/.test(value)) return home;
  return grocery;
}

export function categoryNames(data: ShoppingData) {
  const custom = alive(data.categories).map((category) => category.name);
  return [...defaultCategories, ...custom.filter((name) => !defaultCategories.includes(name))];
}

// Category order used to sort a list: the store's own order when the list has a store.
export function categoryOrderFor(list: ShoppingList, data: ShoppingData) {
  const names = categoryNames(data);
  const store = data.stores.find((entry) => entry.id === list.storeId && !entry.deleted);
  if (!store) return names;
  return [...store.categoryOrder.filter((name) => names.includes(name)), ...names.filter((name) => !store.categoryOrder.includes(name))];
}

export function sortItems(items: ShoppingItem[], list: ShoppingList, data: ShoppingData) {
  if (list.sortMode === "manual") return [...items].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ru"));
  const rank = new Map(categoryOrderFor(list, data).map((category, index) => [category, index]));
  return [...items].sort((a, b) => (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99) || a.name.localeCompare(b.name, "ru"));
}

export function progress(list: ShoppingList) {
  const items = alive(list.items);
  const bought = items.filter((item) => item.purchased).length;
  return { bought, total: items.length, left: items.length - bought, percent: items.length ? (bought / items.length) * 100 : 0 };
}

export function newItem(product: Product, order: number, now = Date.now()): ShoppingItem {
  return {
    id: createId(),
    name: product.name.trim(),
    quantity: product.quantity.trim() || "1",
    unit: product.unit || "шт.",
    category: product.category || guessCategory(product.name),
    note: product.note.trim(),
    purchased: false,
    favorite: false,
    order,
    updatedAt: now,
  };
}

export function newList(name: string, now = Date.now()): ShoppingList {
  return { id: createId(), name: name.trim(), createdAt: now, updatedAt: now, sortMode: "category", items: [] };
}

function nextOrder(list: ShoppingList) {
  return list.items.reduce((max, item) => Math.max(max, item.order), 0) + 1;
}

// Adds products to a list; a product already waiting to be bought gets its quantity added.
export function addProducts(list: ShoppingList, products: Product[], now = Date.now()): ShoppingList {
  let items = [...list.items];
  let order = nextOrder(list);
  for (const product of products) {
    if (!product.name.trim()) continue;
    const key = product.name.trim().toLocaleLowerCase("ru");
    const existing = items.find((item) => !item.deleted && !item.purchased && item.name.toLocaleLowerCase("ru") === key);
    if (existing) {
      const sum = Number(existing.quantity.replace(",", ".")) + Number((product.quantity || "1").replace(",", "."));
      const quantity = existing.unit === (product.unit || existing.unit) && Number.isFinite(sum) ? String(Math.round(sum * 100) / 100) : existing.quantity;
      items = items.map((item) => (item.id === existing.id ? { ...item, quantity, updatedAt: now } : item));
    } else {
      items.push(newItem(product, order, now));
      order += 1;
    }
  }
  return { ...list, items };
}

export function toProduct(item: Product): Product {
  return { name: item.name, quantity: item.quantity, unit: item.unit, category: item.category, note: item.note };
}

// --- Seed and migration ------------------------------------------------------------------------

// Demo lists stay on the device until the user changes them (see isDemoList), so their ids only
// have to be unique; `_name` just labels the call sites.
function seedList(_name: string, name: string, daysAgo: number, products: [string, string, string, string, boolean?, boolean?][]): ShoppingList {
  const createdAt = Date.now() - daysAgo * 86_400_000;
  const id = createId();
  return {
    id,
    name,
    createdAt,
    // Demo data counts as changed long ago, so anything real (including its deletion) wins a merge.
    updatedAt: 1,
    sortMode: "category",
    items: products.map(([name, quantity, unit, category, purchased = false, favorite = false], index) => ({
      id: `${id}-${index}`,
      name,
      quantity,
      unit,
      category,
      note: "",
      purchased,
      favorite,
      order: index + 1,
      updatedAt: 1,
    })),
  };
}

// A demo list the user has not touched: not sent to the account, and dropped when the account
// already has lists of its own.
export function isDemoList(list: ShoppingList) {
  return list.updatedAt === 1 && list.items.every((item) => item.updatedAt === 1);
}

export function seedData(): ShoppingData {
  return {
    ...emptyData(),
    lists: [
      seedList("weekly-shop", "Покупки на неделю", 0, [
        ["Молоко", "1", "л", "Молочные продукты", true, true],
        ["Хлеб", "1", "шт.", "Бакалея", true, true],
        ["Яблоки", "1", "кг", "Овощи и фрукты", false, true],
        ["Яйца", "10", "шт.", "Молочные продукты"],
        ["Помидоры", "500", "г", "Овощи и фрукты"],
        ["Сыр", "200", "г", "Молочные продукты"],
        ["Кофе", "1", "уп.", "Бакалея"],
      ]),
      seedList("home-shop", "Покупки для дома", 1, [
        ["Губки для посуды", "1", "уп.", "Для дома", true],
        ["Бумажные полотенца", "2", "уп.", "Для дома"],
        ["Жидкое мыло", "1", "шт.", "Для дома"],
        ["Пакеты для мусора", "1", "уп.", "Для дома"],
      ]),
      seedList("weekend-shop", "Выходные", 2, [
        ["Куриное филе", "1", "кг", "Мясо и рыба"],
        ["Картофель", "2", "кг", "Овощи и фрукты"],
        ["Сметана", "1", "шт.", "Молочные продукты"],
      ]),
    ],
    recipes: [
      {
        id: "recipe-syrniki",
        name: "Сырники",
        note: "Смешать творог, яйцо, муку и сахар, обжарить на среднем огне.",
        updatedAt: 1,
        ingredients: [
          { name: "Творог", quantity: "400", unit: "г", category: "Молочные продукты", note: "" },
          { name: "Яйца", quantity: "1", unit: "шт.", category: "Молочные продукты", note: "" },
          { name: "Мука", quantity: "3", unit: "уп.", category: "Бакалея", note: "ст. ложки" },
          { name: "Сахар", quantity: "2", unit: "уп.", category: "Бакалея", note: "ст. ложки" },
        ],
      },
    ],
  };
}

type LegacyItem = Partial<ShoppingItem> & { id: string; name: string };
type LegacyList = { id: string; name: string; createdAt?: number; updatedAt?: number; completedAt?: number; sortMode?: ShoppingList["sortMode"]; items?: LegacyItem[] };

function upgradeList(list: LegacyList, completedAt?: number): ShoppingList {
  return {
    ...list,
    createdAt: list.createdAt ?? Date.now(),
    updatedAt: list.updatedAt ?? 1,
    sortMode: list.sortMode ?? "category",
    ...(completedAt ? { completedAt } : {}),
    items: (list.items ?? []).map((item, index) => ({
      quantity: "1",
      unit: "шт.",
      category: guessCategory(item.name),
      note: "",
      purchased: false,
      favorite: false,
      ...item,
      order: item.order ?? index + 1,
      updatedAt: item.updatedAt ?? 1,
    })),
  };
}

// Accepts what earlier versions of the app saved: { lists, history, darkMode }.
export function migrate(raw: unknown): ShoppingData | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ShoppingData> & { history?: LegacyList[]; darkMode?: boolean };
  if (!Array.isArray(value.lists)) return null;
  if (value.settings) return { ...emptyData(), ...value, sharing: value.sharing ?? {} } as ShoppingData;
  return {
    ...emptyData(),
    lists: [
      ...value.lists.map((list) => upgradeList(list as LegacyList)),
      ...(value.history ?? []).map((list) => upgradeList(list, list.completedAt ?? list.updatedAt ?? Date.now())),
    ],
    settings: { darkMode: value.darkMode === true, updatedAt: 1 },
  };
}

// --- Undo --------------------------------------------------------------------------------------

function restoreEntities<T extends { id: string; updatedAt: number }>(before: T[], current: T[], now: number, restore: (old: T, cur: T | undefined) => T = (old) => ({ ...old, updatedAt: now })) {
  const byId = new Map(current.map((entity) => [entity.id, entity]));
  const restored = new Map(byId);
  for (const old of before) {
    const cur = byId.get(old.id);
    if (!cur || JSON.stringify(cur) !== JSON.stringify(old)) restored.set(old.id, restore(old, cur));
  }
  return [...restored.values()];
}

// Puts back the state `before`, as a new change: everything that differs gets a fresh timestamp so
// that the restored versions also win on the other devices.
export function restore(before: ShoppingData, current: ShoppingData, now = Date.now()): ShoppingData {
  return {
    ...current,
    lists: restoreEntities(before.lists, current.lists, now, (old, cur) => ({
      ...old,
      updatedAt: cur && JSON.stringify({ ...cur, items: [] }) === JSON.stringify({ ...old, items: [] }) ? old.updatedAt : now,
      items: restoreEntities(old.items, cur?.items ?? [], now),
    })),
    stores: restoreEntities(before.stores, current.stores, now),
    templates: restoreEntities(before.templates, current.templates, now),
    recipes: restoreEntities(before.recipes, current.recipes, now),
    categories: restoreEntities(before.categories, current.categories, now),
  };
}

// --- Text --------------------------------------------------------------------------------------

export function listAsText(list: ShoppingList) {
  const items = alive(list.items);
  const left = items.filter((item) => !item.purchased);
  const lines = (left.length ? left : items).map((item) => `• ${item.name} — ${item.quantity} ${item.unit}${item.note ? ` (${item.note})` : ""}`);
  return `🛒 ${list.name}\n${lines.join("\n") || "Список пуст"}`;
}

const ingredientPattern = /^(.*?)(?:[\s,—-]+(\d+(?:[.,]\d+)?)\s*(шт\.?|кг|г|л|мл|уп\.?)?)?$/i;

// One product per line: "Мука 500 г", "Яйца, 3 шт.", "Соль".
export function parseProducts(text: string, categories: string[]): Product[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [, name = line, quantity, unit] = ingredientPattern.exec(line) ?? [];
      const cleanName = (name || line).trim();
      const normalizedUnit = unit ? (units.find((entry) => entry.replace(".", "") === unit.toLowerCase().replace(".", "")) ?? "шт.") : "шт.";
      const category = guessCategory(cleanName);
      return { name: cleanName, quantity: quantity?.replace(",", ".") ?? "1", unit: normalizedUnit, category: categories.includes(category) ? category : categories[3], note: "" };
    });
}

export function productsAsText(products: Product[]) {
  return products.map((product) => `${product.name} ${product.quantity} ${product.unit}`.trim()).join("\n");
}

// Products bought before whose name starts with (or contains) the typed text, most frequent first.
export function suggestions(data: ShoppingData, typed: string, exclude: ShoppingList | null, limit = 5): Product[] {
  const query = typed.trim().toLocaleLowerCase("ru");
  if (!query) return [];
  const waiting = new Set(exclude ? alive(exclude.items).filter((item) => !item.purchased).map((item) => item.name.toLocaleLowerCase("ru")) : []);
  const seen = new Map<string, { product: Product; count: number; latest: number }>();
  const sources: (Product & { updatedAt?: number })[] = [
    ...data.lists.flatMap((list) => alive(list.items)),
    ...alive(data.templates).flatMap((template) => template.items),
    ...alive(data.recipes).flatMap((recipe) => recipe.ingredients),
  ];
  for (const product of sources) {
    const key = product.name.trim().toLocaleLowerCase("ru");
    if (!key || waiting.has(key) || !key.includes(query) || key === query) continue;
    const entry = seen.get(key);
    const updatedAt = product.updatedAt ?? 0;
    if (!entry) seen.set(key, { product: toProduct(product), count: 1, latest: updatedAt });
    else seen.set(key, { product: updatedAt >= entry.latest ? toProduct(product) : entry.product, count: entry.count + 1, latest: Math.max(updatedAt, entry.latest) });
  }
  return [...seen.entries()]
    .sort(([a, x], [b, y]) => Number(b.startsWith(query)) - Number(a.startsWith(query)) || y.count - x.count || a.localeCompare(b, "ru"))
    .slice(0, limit)
    .map(([, entry]) => entry.product);
}

export function formatReminder(time: number) {
  const date = new Date(time);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const hours = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `сегодня, ${hours}`;
  if (date.toDateString() === tomorrow.toDateString()) return `завтра, ${hours}`;
  return `${date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}, ${hours}`;
}
