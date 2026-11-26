// Data of the app and the operations on it that do not depend on the screen.
//
// Everything that syncs between devices is an entity with an `id` and an `updatedAt` set when it
// was last changed on any device; removing an entity leaves a tombstone (`deleted: true`) so the
// removal reaches the other copies. Copies are merged per entity (shared/merge.js), which is why
// every change below stamps exactly the entities it touches.
import { mergeLists, mergeProfile, pruneList, pruneProfile } from "../shared/merge.js";
import { locale, t } from "./i18n.ts";

export const defaultCategories = ["Овощи и фрукты", "Мясо и рыба", "Молочные продукты", "Бакалея", "Напитки", "Для дома", "Сладости и снеки"];
// Stored as written here whatever the language (src/i18n.ts); t() translates them for display.
export const units = ["шт.", "кг", "г", "л", "мл", "уп."];

// A shop product sold as a pack of pieces: "Яйца С1 10шт", "Ouă 10 buc.", "Eggs 6 pcs".
export function countsPieces(productName: string) {
  return /\d+\s*(шт|buc|pcs)/i.test(productName);
}

// Units as people type them in any of the app's languages.
const unitAliases: Record<string, string> = {
  "шт": "шт.", "pcs": "шт.", "pc": "шт.", "buc": "шт.",
  "кг": "кг", "kg": "кг",
  "г": "г", "g": "г",
  "л": "л", "l": "л",
  "мл": "мл", "ml": "мл",
  "уп": "уп.", "pack": "уп.", "pkg": "уп.", "pachet": "уп.", "pac": "уп.",
};

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
  repeat?: Repeat;
  // Hidden from the family (api/_family.js): only the list's own members see it.
  personal?: boolean;
  deleted?: boolean;
  items: ShoppingItem[];
};

// A reminder that comes back at `time` ("HH:MM"): every day, on the given weekdays (0 is Sunday)
// or on the given day of the month (1–31; a shorter month uses its last day).
export type Repeat = { every: "day" | "week" | "month"; days: number[]; time: string };

export type Store = { id: string; name: string; categoryOrder: string[]; updatedAt: number; deleted?: boolean };
export type Template = { id: string; name: string; items: Product[]; updatedAt: number; deleted?: boolean };
// One step of cooking; `minutes` gives the step a timer.
export type RecipeStep = { id: string; text: string; minutes?: number };
// `note` is the plain-text form of the steps, kept for app versions that predate steps.
// `photo` is the id of a photo (src/photos.ts).
export type Recipe = { id: string; name: string; note: string; ingredients: Product[]; steps?: RecipeStep[]; photo?: string; updatedAt: number; deleted?: boolean };
export type Category = { id: string; name: string; updatedAt: number; deleted?: boolean };
export type Settings = { darkMode: boolean; updatedAt: number };
// Received from the server for lists that more than one account has; never edited locally.
// `family`: the list is open to the whole family, not only to its own members.
export type Sharing = Record<string, { members: number; owner: boolean; family?: boolean }>;

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
  return pruneData({ ...local, ...profile, lists, sharing: remote.sharing ?? local.sharing });
}

// Drops tombstones old enough that every copy has seen them (shared/merge.js).
export function pruneData(data: ShoppingData, now = Date.now()): ShoppingData {
  return { ...data, ...pruneProfile(profileOf(data), now), lists: data.lists.map((list) => pruneList(list, now)) };
}

// The default category a product most likely belongs to, from words in its name in Russian,
// English or Romanian.
export function guessCategory(name: string) {
  const value = ` ${name.toLocaleLowerCase()} `;
  const [vegetables, meat, dairy, grocery, drinks, home, sweets] = defaultCategories;
  if (/яблок|помидор|томат|лук|огур|картоф|морков|зелень|капуст|банан|апельс|перец|лимон|груш|чеснок|укроп|петруш|apple|tomato|onion|cucumber|potato|carrot|cabbage|banana|orange|pepper|lemon|pear|garlic|dill|parsley|lettuce|eggplant|fruit|vegetable|berr|mere|măr|roșii|rosii|ceap|castrave|cartof|morcov|varz|portocal|ardei|lămâ|lamai|usturo|mărar|marar|pătrunjel|patrunjel|salat|vinete|fruct|legum/.test(value)) return vegetables;
  if (/кур|мяс|говяд|свин|рыб|фарш|колбас|сосиск|филе|индейк|chicken|meat|beef|pork|fish|mince|sausage|ham |fillet|turkey|salmon|tuna|pui|carne|vită|vita|porc|pește|peste|tocat|cârna|carna|crenvur|curcan|somon|șunc|sunc/.test(value)) return meat;
  if (/молок|сыр|яйц|сметан|йогурт|кефир|творог|масло слив|сливк|milk|cheese|egg|sour cream|yogh?urt|kefir|cottage|butter|lapte|brânz|branz| ou | ouă | oua |smântân|smantan|iaurt|chefir| unt |frișc|frisc/.test(value)) return dairy;
  if (/вода|сок|чай|кофе|напит|лимонад|water|juice| tea|coffee|drink|soda|lemonade| apă | apa | suc|ceai|cafea|băutur|bautur|limonad/.test(value)) return drinks;
  if (/шоколад|печень|снек|конфет|чипс|слад|chocolate|cookie|biscuit|snack|candy|sweet|chips|cake|ciocolat|bomboan|dulc|prăjitur|prajitur/.test(value)) return sweets;
  if (/моющ|губк|пакет|бумаг|средств|мыло|шампун|detergent|sponge| bag|paper|soap|shampoo|towel|cleaner|burete|pung|hârtie|hartie|săpun|sapun|șampon|sampon|prosop/.test(value)) return home;
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
  if (list.sortMode === "manual") return [...items].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, locale()));
  const rank = new Map(categoryOrderFor(list, data).map((category, index) => [category, index]));
  return [...items].sort((a, b) => (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99) || a.name.localeCompare(b.name, locale()));
}

export function progress(list: ShoppingList) {
  const items = alive(list.items);
  const bought = items.filter((item) => item.purchased).length;
  return { bought, total: items.length, left: items.length - bought, percent: items.length ? (bought / items.length) * 100 : 0 };
}

const productImages: Record<string, string> = {
  "молоко": "milk", "milk": "milk", "lapte": "milk",
  "хлеб": "bread", "bread": "bread", "pâine": "bread", "paine": "bread",
  "яблоки": "apples", "apples": "apples", "mere": "apples",
  "яйца": "eggs", "eggs": "eggs", "ouă": "eggs", "oua": "eggs",
  "помидоры": "tomatoes", "tomatoes": "tomatoes", "roșii": "tomatoes", "rosii": "tomatoes",
  "сыр": "cheese", "cheese": "cheese", "brânză": "cheese", "branza": "cheese",
  "кофе": "coffee", "coffee": "coffee", "cafea": "coffee",
};

// A picture for a common product, when there is one.
export function productImage(name: string) {
  const image = productImages[name.trim().toLocaleLowerCase()];
  return image ? `/assets/app/items/${image}.png` : undefined;
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
      seedList("weekly-shop", t("Покупки на неделю"), 0, [
        [t("Молоко"), "1", "л", "Молочные продукты", true, true],
        [t("Хлеб"), "1", "шт.", "Бакалея", true, true],
        [t("Яблоки"), "1", "кг", "Овощи и фрукты", false, true],
        [t("Яйца"), "10", "шт.", "Молочные продукты"],
        [t("Помидоры"), "500", "г", "Овощи и фрукты"],
        [t("Сыр"), "200", "г", "Молочные продукты"],
        [t("Кофе"), "1", "уп.", "Бакалея"],
      ]),
      seedList("home-shop", t("Покупки для дома"), 1, [
        [t("Губки для посуды"), "1", "уп.", "Для дома", true],
        [t("Бумажные полотенца"), "2", "уп.", "Для дома"],
        [t("Жидкое мыло"), "1", "шт.", "Для дома"],
        [t("Пакеты для мусора"), "1", "уп.", "Для дома"],
      ]),
      seedList("weekend-shop", t("Выходные"), 2, [
        [t("Куриное филе"), "1", "кг", "Мясо и рыба"],
        [t("Картофель"), "2", "кг", "Овощи и фрукты"],
        [t("Сметана"), "1", "шт.", "Молочные продукты"],
      ]),
    ],
    recipes: [
      {
        id: "recipe-syrniki",
        name: t("Сырники"),
        note: "",
        steps: [
          { id: "recipe-syrniki-1", text: t("Смешать творог, яйцо, муку и сахар.") },
          { id: "recipe-syrniki-2", text: t("Дать тесту постоять 10 минут."), minutes: 10 },
          { id: "recipe-syrniki-3", text: t("Обжарить с каждой стороны по 3 минуты на среднем огне."), minutes: 6 },
        ],
        updatedAt: 1,
        ingredients: [
          { name: t("Творог"), quantity: "400", unit: "г", category: "Молочные продукты", note: "" },
          { name: t("Яйца"), quantity: "1", unit: "шт.", category: "Молочные продукты", note: "" },
          { name: t("Мука"), quantity: "3", unit: "уп.", category: "Бакалея", note: t("ст. ложки") },
          { name: t("Сахар"), quantity: "2", unit: "уп.", category: "Бакалея", note: t("ст. ложки") },
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
  if (value.settings) return pruneData({ ...emptyData(), ...value, sharing: value.sharing ?? {} } as ShoppingData);
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
  const lines = (left.length ? left : items).map((item) => `• ${item.name} — ${item.quantity} ${t(item.unit)}${item.note ? ` (${item.note})` : ""}`);
  return `🛒 ${list.name}\n${lines.join("\n") || t("Список пуст")}`;
}

const ingredientPattern = /^(.*?)(?:[\s,—-]+(\d+(?:[.,]\d+)?)\s*(шт\.?|кг|г|л|мл|уп\.?|pcs?\.?|kg|g|l|ml|pack|pkg|buc\.?|pachet|pac\.?)?)?$/i;

// One product per line: "Мука 500 г", "Яйца, 3 шт.", "Flour 500 g", "Ouă 3 buc.", "Соль".
export function parseProducts(text: string, categories: string[]): Product[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [, name = line, quantity, unit] = ingredientPattern.exec(line) ?? [];
      const cleanName = (name || line).trim();
      const normalizedUnit = unit ? (unitAliases[unit.toLowerCase().replace(".", "")] ?? "шт.") : "шт.";
      const category = guessCategory(cleanName);
      return { name: cleanName, quantity: quantity?.replace(",", ".") ?? "1", unit: normalizedUnit, category: categories.includes(category) ? category : categories[3], note: "" };
    });
}

// --- Recipe steps ------------------------------------------------------------------------------

const durationPattern = /(\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*(\d+(?:[.,]\d+)?))?\s*(час(?:а|ов)?|ч\.?|мин(?:ут[ауы]?|\.)?|hours?|hrs?|h|minutes?|mins?|oră|ore|ora|minute|minut)(?![a-zа-яёăâîșț])/i;

// "Варить 10–12 минут" → 12, "тушить 1,5 часа" → 90, "bake for 20 minutes" → 20,
// "fierbe 1,5 ore" → 90; nothing found → undefined.
export function guessMinutes(text: string): number | undefined {
  const match = durationPattern.exec(text);
  if (!match) return undefined;
  const value = Number((match[2] ?? match[1]).replace(",", "."));
  const minutes = Math.round(/^(ч|h|o)/i.test(match[3]) ? value * 60 : value);
  return minutes > 0 && minutes <= 24 * 60 ? minutes : undefined;
}

// The steps of a recipe. Recipes saved before steps existed keep their method in `note`: each
// line becomes a step, so they are converted when read and nothing has to be migrated.
export function stepsOf(recipe: Pick<Recipe, "id" | "note" | "steps">): RecipeStep[] {
  if (recipe.steps?.length) return recipe.steps;
  return recipe.note
    .split("\n")
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean)
    .map((text, index) => ({ id: `${recipe.id}-step-${index}`, text, minutes: guessMinutes(text) }));
}

export function stepsAsNote(steps: RecipeStep[]) {
  return steps.map((step, index) => `${index + 1}. ${step.text}`).join("\n");
}

export function totalMinutes(steps: RecipeStep[]) {
  return steps.reduce((sum, step) => sum + (step.minutes ?? 0), 0);
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return t("{minutes} мин", { minutes: rest });
  return rest ? t("{hours} ч {minutes} мин", { hours, minutes: rest }) : t("{hours} ч", { hours });
}

export function productsAsText(products: Product[]) {
  return products.map((product) => `${product.name} ${product.quantity} ${t(product.unit)}`.trim()).join("\n");
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
    .sort(([a, x], [b, y]) => Number(b.startsWith(query)) - Number(a.startsWith(query)) || y.count - x.count || a.localeCompare(b, locale()))
    .slice(0, limit)
    .map(([, entry]) => entry.product);
}

export function formatReminder(time: number) {
  const date = new Date(time);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const time_ = date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return t("сегодня, {time}", { time: time_ });
  if (date.toDateString() === tomorrow.toDateString()) return t("завтра, {time}", { time: time_ });
  return `${date.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" })}, ${time_}`;
}

// --- Repeating reminders -----------------------------------------------------------------------

function repeatClock(repeat: Repeat) {
  const [hours, minutes] = repeat.time.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

// The next `count` times a repeating reminder comes, after `from`.
export function repeatTimes(repeat: Repeat, count: number, from = Date.now()) {
  const { hours, minutes } = repeatClock(repeat);
  const times: number[] = [];
  const start = new Date(from);
  // Day by day for a year at most: enough for any rule, and a rule without days gives nothing.
  for (let offset = 0; offset < 400 && times.length < count; offset += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, hours, minutes);
    if (day.getTime() <= from) continue;
    const lastOfMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
    const matches =
      repeat.every === "day" ||
      (repeat.every === "week" && repeat.days.includes(day.getDay())) ||
      (repeat.every === "month" && repeat.days.some((wanted) => Math.min(wanted, lastOfMonth) === day.getDate()));
    if (matches) times.push(day.getTime());
  }
  return times;
}

// The next reminder of a list, one-time or repeating.
export function nextReminder(list: ShoppingList, now = Date.now()) {
  const once = list.remindAt && list.remindAt > now ? list.remindAt : undefined;
  const repeated = list.repeat ? repeatTimes(list.repeat, 1, now)[0] : undefined;
  if (once === undefined) return repeated;
  return repeated === undefined ? once : Math.min(once, repeated);
}

// Monday first, as calendars here are.
export const weekdays = [1, 2, 3, 4, 5, 6, 0];

export function weekdayName(day: number) {
  // 4 January 1970 was a Sunday.
  return new Date(1970, 0, 4 + day).toLocaleDateString(locale(), { weekday: "short" });
}

export function formatRepeat(repeat: Repeat) {
  const time = repeat.time;
  if (repeat.every === "day") return t("каждый день в {time}", { time });
  if (repeat.every === "week") {
    const days = weekdays.filter((day) => repeat.days.includes(day));
    if (days.length === 7) return t("каждый день в {time}", { time });
    return t("по дням: {days}, в {time}", { days: days.map(weekdayName).join(", "), time });
  }
  return t("каждый месяц, {day}-го числа в {time}", { day: [...repeat.days].sort((a, b) => a - b).join(", "), time });
}
