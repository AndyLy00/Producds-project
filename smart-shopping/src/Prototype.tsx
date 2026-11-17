import {
  ArchiveIcon,
  ArrowLeftIcon,
  BackpackIcon,
  BellIcon,
  BookmarkIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  Cross2Icon,
  DotsHorizontalIcon,
  DragHandleDots2Icon,
  EnvelopeClosedIcon,
  ExitIcon,
  GearIcon,
  HeartIcon,
  HomeIcon,
  Link2Icon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MixIcon,
  MoonIcon,
  Pencil1Icon,
  PersonIcon,
  PlusIcon,
  ReaderIcon,
  Share1Icon,
  StarFilledIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { BottomSheet, KeyboardInput, KeyboardTextarea, MobileScroll, useKeyboard, useKeyboardInsets } from "./mobile";
import { useCloudSync, type Member } from "./cloud-sync";
import { allowReminders, isNativeApp, onReminderOpened, renderGoogleButton, scheduleReminders, shareText, updateWidget } from "./device";
import {
  addProducts,
  alive,
  categoryNames,
  categoryOrderFor,
  createId,
  emptyData,
  formatReminder,
  guessCategory,
  listAsText,
  newList,
  parseProducts,
  productsAsText,
  progress,
  restore,
  sortItems,
  suggestions,
  toProduct,
  units,
  type Product,
  type Recipe,
  type ShoppingData,
  type ShoppingItem,
  type ShoppingList,
  type Store,
  type Template,
} from "./model";
import { loadShoppingData, saveShoppingData } from "./shopping-data";
import { moveItem, Sortable, type DragHandle } from "./sortable";

const productImages: Record<string, string> = {
  молоко: "/assets/app/items/milk.png",
  хлеб: "/assets/app/items/bread.png",
  яблоки: "/assets/app/items/apples.png",
  яйца: "/assets/app/items/eggs.png",
  помидоры: "/assets/app/items/tomatoes.png",
  сыр: "/assets/app/items/cheese.png",
  кофе: "/assets/app/items/coffee.png",
};

type Tab = "lists" | "favorites" | "recipes" | "history" | "settings";
type AccountStep = "login" | "register" | "verify" | "forgot" | "reset";
type Sheet =
  | { kind: "product"; itemId?: string }
  | { kind: "list"; listId?: string }
  | { kind: "actions"; listId: string }
  | { kind: "share"; listId: string }
  | { kind: "reminder"; listId: string }
  | { kind: "store-pick"; listId: string }
  | { kind: "pick-list"; title: string; products: Product[] }
  | { kind: "recipe"; recipeId?: string }
  | { kind: "store"; storeId?: string; forListId?: string }
  | { kind: "categories" }
  | { kind: "account"; step: AccountStep }
  | { kind: "password" }
  | { kind: "delete-account" };
type Toast = { text: string; undo?: ShoppingData };

const blankProduct = (): Product => ({ name: "", quantity: "1", unit: "шт.", category: "", note: "" });
const errorText = (error: unknown) => (error instanceof Error ? error.message : "Что-то пошло не так. Попробуйте ещё раз.");

function toLocalInput(time: number) {
  return new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function at(daysFromToday: number, hours: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hours, 0, 0, 0);
  return date.getTime();
}

function nextWeekday(weekday: number, hours: number) {
  return at(((weekday - new Date().getDay() + 7) % 7) || 7, hours);
}

// Invitation opened as https://…/join?invite=… (on the site, or in the app through an app link).
function inviteFromAddress() {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.search).get("invite");
  if (token) window.history.replaceState(null, "", "/");
  return token;
}

export default function Prototype() {
  const [data, setData] = useState<ShoppingData>(emptyData);
  const [ready, setReady] = useState(false);
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("lists");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [form, setForm] = useState<Product>(blankProduct);
  const [listName, setListName] = useState("");
  const [quickName, setQuickName] = useState("");
  const [showPurchased, setShowPurchased] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [recipeForm, setRecipeForm] = useState({ name: "", ingredients: "", note: "" });
  const [storeForm, setStoreForm] = useState({ name: "", order: [] as string[] });
  const [categoryName, setCategoryName] = useState("");
  const [reminderValue, setReminderValue] = useState("");
  const [credentials, setCredentials] = useState({ email: "", password: "", code: "", current: "" });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareState, setShareState] = useState<{ link: string; email: string; members: Member[] }>({ link: "", email: "", members: [] });
  const [pendingInvite, setPendingInvite] = useState<string | null>(inviteFromAddress);
  const googleButton = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const keyboard = useKeyboard();
  const { bottomInset } = useKeyboardInsets();
  const notify = useCallback((text: string) => setToast({ text }), []);
  const cloud = useCloudSync(data, setData, ready, notify);
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;

  useEffect(() => {
    let cancelled = false;
    loadShoppingData().then((saved) => {
      if (cancelled) return;
      setData(saved);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (ready) void saveShoppingData(data);
  }, [data, ready]);

  useEffect(() => {
    document.documentElement.classList.toggle("smart-shopping-dark", data.settings.darkMode);
    return () => document.documentElement.classList.remove("smart-shopping-dark");
  }, [data.settings.darkMode]);

  useEffect(() => {
    if (sheet !== null) return;
    const frame = window.requestAnimationFrame(() => keyboard.hide());
    return () => window.cancelAnimationFrame(frame);
  }, [sheet]);

  // System back button in the Android app (dispatched from src/native/main.tsx).
  // Leaving the event unhandled on the root screen lets the app close.
  useEffect(() => {
    const onBack = (event: Event) => {
      if (sheet !== null) setSheet(null);
      else if (currentListId !== null) setCurrentListId(null);
      else if (tab !== "lists") setTab("lists");
      else return;
      event.preventDefault();
    };
    window.addEventListener("app:back", onBack);
    return () => window.removeEventListener("app:back", onBack);
  }, [sheet, currentListId, tab]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.undo ? 5000 : 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeLists = useMemo(() => alive(data.lists).filter((list) => !list.completedAt).sort((a, b) => b.createdAt - a.createdAt), [data.lists]);
  const history = useMemo(() => alive(data.lists).filter((list) => list.completedAt).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)), [data.lists]);
  const categories = categoryNames(data);
  const currentList = activeLists.find((list) => list.id === currentListId) ?? null;

  // Reminders and the home-screen widget follow the data.
  const reminderKey = JSON.stringify(activeLists.map((list) => [list.id, list.remindAt, list.name, progress(list).left]));
  useEffect(() => {
    if (ready) void scheduleReminders(activeLists);
  }, [ready, reminderKey]);
  useEffect(() => {
    if (ready) updateWidget(activeLists[0]);
  }, [ready, activeLists]);
  useEffect(() => onReminderOpened((listId) => { setSheet(null); setTab("lists"); setCurrentListId(listId); }), []);

  // Links opened in the Android app: invitations and the return from Google sign-in.
  useEffect(() => {
    if (!ready) return;
    const handle = () => {
      for (const address of (window as { appUrlQueue?: string[] }).appUrlQueue?.splice(0) ?? []) {
        let url: URL;
        try {
          url = new URL(address);
        } catch {
          continue;
        }
        const invite = url.searchParams.get("invite");
        if (invite) setPendingInvite(invite);
        const code = url.protocol === "korzina:" && url.host === "auth" ? url.searchParams.get("code") : null;
        if (code) {
          cloudRef.current.account.finishAppGoogleLogin(code).then(() => { setSheet(null); notify("Вы вошли через Google"); }, (error) => notify(errorText(error)));
        }
      }
    };
    handle();
    window.addEventListener("app:url", handle);
    return () => window.removeEventListener("app:url", handle);
  }, [ready, notify]);

  useEffect(() => {
    if (!pendingInvite || !ready) return;
    if (!cloud.email) {
      openAccount("login");
      setFormError("Войдите или создайте аккаунт, чтобы присоединиться к списку.");
      return;
    }
    const token = pendingInvite;
    setPendingInvite(null);
    cloud.share.join(token).then(
      ({ listId, name }) => { setSheet(null); setTab("lists"); setCurrentListId(listId); notify(`Вы присоединились к списку «${name}»`); },
      (error) => notify(errorText(error)),
    );
  }, [pendingInvite, ready, cloud.email]);

  // Google's own button on the web; the Android app signs in through the browser instead.
  const accountStep = sheet?.kind === "account" ? sheet.step : null;
  useEffect(() => {
    const element = googleButton.current;
    const clientId = cloud.config.googleClientId;
    if (!element || !clientId || isNativeApp || (accountStep !== "login" && accountStep !== "register")) return;
    renderGoogleButton(element, clientId, (credential) => {
      cloudRef.current.account.googleCredential(credential).then(() => { setSheet(null); notify("Вы вошли через Google"); }, (error) => setFormError(errorText(error)));
    }).catch(() => undefined);
  }, [accountStep, cloud.config.googleClientId]);

  // --- Changes -----------------------------------------------------------------------------------

  function change(updater: (previous: ShoppingData) => ShoppingData) {
    setData(updater);
    cloud.markDirty();
  }

  function undoable(text: string, updater: (previous: ShoppingData) => ShoppingData) {
    const before = dataRef.current;
    change(updater);
    setToast({ text, undo: before });
  }

  function undo() {
    const before = toast?.undo;
    if (!before) return;
    change((current) => restore(before, current));
    setToast({ text: "Действие отменено" });
  }

  function editList(listId: string, edit: (list: ShoppingList) => ShoppingList) {
    change((previous) => ({ ...previous, lists: previous.lists.map((list) => (list.id === listId ? edit(list) : list)) }));
  }

  function patchList(listId: string, patch: Partial<ShoppingList>) {
    editList(listId, (list) => ({ ...list, ...patch, updatedAt: Date.now() }));
  }

  function patchItem(listId: string, itemId: string, patch: Partial<ShoppingItem>) {
    editList(listId, (list) => ({ ...list, items: list.items.map((item) => (item.id === itemId ? { ...item, ...patch, updatedAt: Date.now() } : item)) }));
  }

  function saveEntity<K extends "stores" | "templates" | "recipes" | "categories">(key: K, entity: ShoppingData[K][number]) {
    change((previous) => {
      const entities = previous[key] as ShoppingData[K][number][];
      const exists = entities.some((entry) => entry.id === entity.id);
      return { ...previous, [key]: exists ? entities.map((entry) => (entry.id === entity.id ? entity : entry)) : [...entities, entity] };
    });
  }

  function removeEntity(key: "stores" | "templates" | "recipes" | "categories", id: string, text: string) {
    undoable(text, (previous) => ({
      ...previous,
      [key]: (previous[key] as { id: string }[]).map((entry) => (entry.id === id ? { ...entry, deleted: true, updatedAt: Date.now() } : entry)),
    }));
  }

  const openSheet = (next: Sheet) => {
    keyboard.hide();
    setFormError("");
    setSheet(next);
  };
  const closeSheet = () => {
    keyboard.hide();
    setSheet(null);
  };

  // --- Lists ---------------------------------------------------------------------------------------

  function openList(listId: string) {
    setCurrentListId(listId);
    setQuery("");
    setTab("lists");
  }

  function startNewList() {
    setListName("");
    openSheet({ kind: "list" });
  }

  function addList(list: ShoppingList) {
    change((previous) => ({ ...previous, lists: [list, ...previous.lists] }));
    setSheet(null);
    openList(list.id);
  }

  function submitListName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listName.trim() || sheet?.kind !== "list") return;
    if (sheet.listId) {
      patchList(sheet.listId, { name: listName.trim() });
      notify("Название списка изменено");
      closeSheet();
    } else {
      addList(newList(listName));
    }
  }

  function deleteList(list: ShoppingList) {
    setSheet(null);
    setCurrentListId(null);
    const sharing = data.sharing[list.id];
    if (sharing && !sharing.owner) {
      cloud.share.leave(list.id).then(() => notify("Вы вышли из совместного списка"), (error) => notify(errorText(error)));
      return;
    }
    undoable("Список удалён", (previous) => ({
      ...previous,
      lists: previous.lists.map((entry) => (entry.id === list.id ? { ...entry, deleted: true, updatedAt: Date.now() } : entry)),
    }));
  }

  function completeList(list: ShoppingList) {
    setSheet(null);
    setCurrentListId(null);
    undoable("Список перемещён в историю", (previous) => ({
      ...previous,
      lists: previous.lists.map((entry) => (entry.id === list.id ? { ...entry, completedAt: Date.now(), remindAt: undefined, updatedAt: Date.now() } : entry)),
    }));
  }

  function repeatList(list: ShoppingList) {
    addList(addProducts(newList(list.name), alive(list.items).map(toProduct)));
  }

  function saveAsTemplate(list: ShoppingList) {
    saveEntity("templates", { id: createId(), name: list.name, items: alive(list.items).map(toProduct), updatedAt: Date.now() });
    setSheet(null);
    notify(`Шаблон «${list.name}» сохранён`);
  }

  async function sendAsText(list: ShoppingList) {
    const result = await shareText(list.name, listAsText(list));
    if (result === "copied") notify("Список скопирован — вставьте его в сообщение");
    if (result === "failed") notify("Не удалось отправить список");
  }

  // --- Products ------------------------------------------------------------------------------------

  function openProductSheet(item?: ShoppingItem) {
    setForm(item ? toProduct(item) : blankProduct());
    openSheet({ kind: "product", itemId: item?.id });
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentList || !form.name.trim() || sheet?.kind !== "product") return;
    const product = { ...form, name: form.name.trim(), category: form.category || guessCategory(form.name) };
    if (sheet.itemId) {
      patchItem(currentList.id, sheet.itemId, product);
      notify("Изменения сохранены");
    } else {
      editList(currentList.id, (list) => addProducts(list, [product]));
      notify("Добавлено в список");
    }
    closeSheet();
  }

  function addQuick(product: Product) {
    if (!currentList) return;
    editList(currentList.id, (list) => addProducts(list, [product]));
    setQuickName("");
  }

  function quickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickName.trim()) return;
    addQuick({ ...blankProduct(), name: quickName.trim(), category: guessCategory(quickName) });
    keyboard.hide();
    notify("Добавлено в список");
  }

  function deleteProduct() {
    if (!currentList || sheet?.kind !== "product" || !sheet.itemId) return;
    const { itemId } = sheet;
    const listId = currentList.id;
    undoable("Продукт удалён", (previous) => ({
      ...previous,
      lists: previous.lists.map((list) => (list.id === listId ? { ...list, items: list.items.map((item) => (item.id === itemId ? { ...item, deleted: true, updatedAt: Date.now() } : item)) } : list)),
    }));
    closeSheet();
  }

  function clearPurchased() {
    if (!currentList) return;
    const listId = currentList.id;
    undoable("Купленные продукты очищены", (previous) => ({
      ...previous,
      lists: previous.lists.map((list) => (list.id === listId ? { ...list, items: list.items.map((item) => (item.purchased && !item.deleted ? { ...item, deleted: true, updatedAt: Date.now() } : item)) } : list)),
    }));
  }

  function toggleSortMode() {
    if (!currentList) return;
    const manual = currentList.sortMode !== "manual";
    const shown = sortItems(alive(currentList.items), currentList, data);
    const now = Date.now();
    editList(currentList.id, (list) => ({
      ...list,
      sortMode: manual ? "manual" : "category",
      updatedAt: now,
      // The manual order starts from what is on screen.
      items: manual
        ? list.items.map((item) => {
            const order = shown.findIndex((entry) => entry.id === item.id) + 1;
            return order > 0 && order !== item.order ? { ...item, order, updatedAt: now } : item;
          })
        : list.items,
    }));
    notify(manual ? "Перетаскивайте продукты за ручку слева" : "Продукты сгруппированы по категориям");
  }

  function reorder(shown: ShoppingItem[], from: number, to: number) {
    if (!currentList) return;
    const orders = new Map(moveItem(shown, from, to).map((item, index) => [item.id, index + 1]));
    const now = Date.now();
    editList(currentList.id, (list) => ({
      ...list,
      items: list.items.map((item) => {
        const order = orders.get(item.id);
        return order !== undefined && order !== item.order ? { ...item, order, updatedAt: now } : item;
      }),
    }));
  }

  function addProductsTo(listId: string | null, products: Product[], name: string) {
    if (listId) {
      editList(listId, (list) => addProducts(list, products));
      setSheet(null);
      openList(listId);
    } else {
      addList(addProducts(newList(name), products));
    }
    notify("Продукты добавлены в список");
  }

  function addToSomeList(title: string, products: Product[]) {
    if (currentList) addProductsTo(currentList.id, products, title);
    else if (activeLists.length === 0) addProductsTo(null, products, title);
    else openSheet({ kind: "pick-list", title, products });
  }

  // --- Profile -------------------------------------------------------------------------------------

  function openRecipe(recipe?: Recipe) {
    setRecipeForm(recipe ? { name: recipe.name, ingredients: productsAsText(recipe.ingredients), note: recipe.note } : { name: "", ingredients: "", note: "" });
    openSheet({ kind: "recipe", recipeId: recipe?.id });
  }

  function saveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sheet?.kind !== "recipe" || !recipeForm.name.trim()) return;
    saveEntity("recipes", {
      id: sheet.recipeId ?? createId(),
      name: recipeForm.name.trim(),
      note: recipeForm.note.trim(),
      ingredients: parseProducts(recipeForm.ingredients, categories),
      updatedAt: Date.now(),
    });
    closeSheet();
    notify("Рецепт сохранён");
  }

  function openStore(store?: Store, forListId?: string) {
    setStoreForm({ name: store?.name ?? "", order: store ? categoryOrderFor({ ...newList(""), storeId: store.id }, data) : categories });
    openSheet({ kind: "store", storeId: store?.id, forListId });
  }

  function saveStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sheet?.kind !== "store" || !storeForm.name.trim()) return;
    const id = sheet.storeId ?? createId();
    saveEntity("stores", { id, name: storeForm.name.trim(), categoryOrder: storeForm.order, updatedAt: Date.now() });
    if (sheet.forListId) patchList(sheet.forListId, { storeId: id });
    closeSheet();
    notify("Магазин сохранён");
  }

  function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    if (categories.some((entry) => entry.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"))) {
      setFormError("Такая категория уже есть.");
      return;
    }
    saveEntity("categories", { id: createId(), name, updatedAt: Date.now() });
    setCategoryName("");
    setFormError("");
  }

  function setReminder(listId: string, time: number | undefined) {
    if (time !== undefined && !(time > Date.now())) {
      setFormError("Выберите время в будущем.");
      return;
    }
    patchList(listId, { remindAt: time });
    closeSheet();
    if (time === undefined) {
      notify("Напоминание убрано");
      return;
    }
    allowReminders().then((allowed) =>
      notify(allowed ? `Напомним ${formatReminder(time)}` : "Напоминание сохранено, но уведомления запрещены — разрешите их в настройках"),
    );
  }

  // --- Account -------------------------------------------------------------------------------------

  function openAccount(step: AccountStep) {
    setCredentials((previous) => ({ ...previous, password: "", code: "", current: "" }));
    openSheet({ kind: "account", step });
  }

  async function run(action: () => Promise<unknown>, done?: () => void) {
    keyboard.hide();
    setBusy(true);
    setFormError("");
    try {
      await action();
      done?.();
    } catch (error) {
      setFormError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sheet?.kind !== "account") return;
    const { email, password, code } = credentials;
    switch (sheet.step) {
      case "login":
        return void run(() => cloud.account.signIn("login", email, password), () => { closeSheet(); notify("Вы вошли в аккаунт"); });
      case "register":
        return void run(() => cloud.account.signIn("register", email, password), () => {
          if (cloud.config.email) openAccount("verify");
          else closeSheet();
          notify("Аккаунт создан");
        });
      case "verify":
        return void run(() => cloud.account.verifyEmail(code), () => { closeSheet(); notify("Почта подтверждена"); });
      case "forgot":
        return void run(() => cloud.account.forgotPassword(email), () => { openAccount("reset"); notify("Если такой аккаунт есть, код уже в почте"); });
      case "reset":
        return void run(() => cloud.account.resetPassword(email, code, password), () => { closeSheet(); notify("Пароль изменён, вы вошли в аккаунт"); });
    }
  }

  function openShare(list: ShoppingList) {
    setShareState({ link: "", email: "", members: [] });
    openSheet({ kind: "share", listId: list.id });
    if (cloud.email && data.sharing[list.id]) cloud.share.members(list.id).then((members) => setShareState((previous) => ({ ...previous, members })), () => undefined);
  }

  // --- Derived view data ---------------------------------------------------------------------------

  const items = currentList ? alive(currentList.items) : [];
  const activeItems = currentList ? sortItems(items.filter((item) => !item.purchased), currentList, data) : [];
  const purchasedItems = currentList ? sortItems(items.filter((item) => item.purchased), currentList, data) : [];
  const search = query.trim().toLocaleLowerCase("ru");
  const filteredItems = activeItems.filter((item) => !search || `${item.name} ${item.category} ${item.note}`.toLocaleLowerCase("ru").includes(search));
  const manual = currentList?.sortMode === "manual" && !search;
  const hints = suggestions(data, quickName, currentList);
  const favorites = useMemo(() => {
    const byName = new Map<string, ShoppingItem & { listId: string; listName: string }>();
    for (const list of activeLists) {
      for (const item of alive(list.items)) {
        const key = item.name.toLocaleLowerCase("ru");
        if (item.favorite && !byName.has(key)) byName.set(key, { ...item, listId: list.id, listName: list.name });
      }
    }
    return [...byName.values()];
  }, [activeLists]);
  const storeName = (list: ShoppingList) => data.stores.find((store) => store.id === list.storeId && !store.deleted)?.name;
  const sheetList = sheet && "listId" in sheet && sheet.listId ? data.lists.find((list) => list.id === sheet.listId) ?? null : null;
  const syncLabel = { idle: "Подключение", syncing: "Сохранение", synced: "Сохранено", error: "Нет связи" }[cloud.status];

  const listBadges = (list: ShoppingList) => {
    const sharing = data.sharing[list.id];
    const store = storeName(list);
    if (!sharing && !store && !list.remindAt) return null;
    return (
      <span className="list-badges">
        {sharing && <span className="badge"><PersonIcon /> {sharing.members}</span>}
        {store && <span className="badge"><MixIcon /> {store}</span>}
        {list.remindAt && <span className={`badge ${list.remindAt < Date.now() ? "badge-alert" : ""}`}><BellIcon /> {formatReminder(list.remindAt)}</span>}
      </span>
    );
  };

  // --- Sheets --------------------------------------------------------------------------------------

  const sheetMeta = (): { title: string; description?: string } => {
    switch (sheet?.kind) {
      case "product": return { title: sheet.itemId ? "Изменить продукт" : "Добавить продукт", description: "Количество, категория и заметка — по желанию." };
      case "list": return { title: sheet.listId ? "Переименовать список" : "Новый список", description: sheet.listId ? undefined : "Дайте списку название или начните с шаблона." };
      case "actions": return { title: sheetList?.name ?? "Список" };
      case "share": return { title: "Вести список вместе", description: "Все участники видят изменения друг друга через несколько секунд." };
      case "reminder": return { title: "Напоминание", description: "Пришлём уведомление в выбранное время." };
      case "store-pick": return { title: "Магазин", description: "Продукты будут идти в порядке отделов этого магазина." };
      case "pick-list": return { title: "В какой список добавить?", description: sheet.title };
      case "recipe": return { title: sheet.recipeId ? "Рецепт" : "Новый рецепт", description: "Ингредиенты — по одному в строке, например «Мука 500 г»." };
      case "store": return { title: sheet.storeId ? "Магазин" : "Новый магазин", description: "Перетащите отделы в том порядке, в каком вы их обходите." };
      case "categories": return { title: "Категории", description: "Свои категории появятся в форме продукта и в порядке магазинов." };
      case "account": return {
        title: { login: "Вход в аккаунт", register: "Новый аккаунт", verify: "Подтверждение почты", forgot: "Восстановление пароля", reset: "Новый пароль" }[sheet.step],
        description: {
          login: "Списки сохранятся в аккаунте и будут доступны на других устройствах.",
          register: "Списки сохранятся в аккаунте и будут доступны на других устройствах.",
          verify: `Мы отправили шестизначный код на ${cloud.email ?? "вашу почту"}.`,
          forgot: "Пришлём на почту код для сброса пароля.",
          reset: `Введите код из письма, отправленного на ${credentials.email}, и новый пароль.`,
        }[sheet.step],
      };
      case "password": return { title: cloud.hasPassword ? "Сменить пароль" : "Задать пароль", description: "На других устройствах нужно будет войти заново." };
      case "delete-account": return { title: "Удалить аккаунт", description: "Аккаунт и его данные на сервере удалятся. Списки на этом устройстве останутся." };
      default: return { title: "" };
    }
  };

  const closeButton = <button type="button" className="sheet-close" aria-label="Закрыть" onClick={closeSheet}><Cross2Icon /></button>;
  const errorBox = formError ? <p className="form-error" role="alert">{formError}</p> : null;
  const field = (label: ReactNode, input: ReactNode) => <label className="form-label">{label}{input}</label>;

  function renderSheet() {
    if (!sheet) return null;
    switch (sheet.kind) {
      case "product":
        return (
          <form className="sheet-form" onSubmit={saveProduct}>
            {closeButton}
            {field("Название", <KeyboardInput placeholder="Например, куриное филе" value={form.name} onChange={(event) => { const name = event.target.value; setForm((previous) => ({ ...previous, name, category: previous.category && previous.category !== guessCategory(previous.name) ? previous.category : guessCategory(name) })); }} onBlur={() => keyboard.hide()} />)}
            <div className="form-grid">
              {field("Количество", <KeyboardInput inputMode="decimal" value={form.quantity} onChange={(event) => { const quantity = event.target.value; setForm((previous) => ({ ...previous, quantity })); }} onBlur={() => keyboard.hide()} />)}
              {field("Единица", <select value={form.unit} onChange={(event) => { const unit = event.target.value; setForm((previous) => ({ ...previous, unit })); }}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select>)}
            </div>
            {field(<>Категория <button type="button" className="inline-link" onClick={() => { setCategoryName(""); openSheet({ kind: "categories" }); }}>Свои категории</button></>, <select value={form.category || guessCategory(form.name)} onChange={(event) => { const category = event.target.value; setForm((previous) => ({ ...previous, category })); }}>{categories.map((category) => <option key={category}>{category}</option>)}</select>)}
            {field(<>Примечание <span>Необязательно</span></>, <KeyboardInput placeholder="Например, для запекания" value={form.note} onChange={(event) => { const note = event.target.value; setForm((previous) => ({ ...previous, note })); }} onBlur={() => keyboard.hide()} />)}
            <div className="sheet-actions">
              <button className="primary-button" disabled={!form.name.trim()}>{sheet.itemId ? "Сохранить" : "Добавить продукт"}</button>
              {sheet.itemId && <button type="button" className="destructive-button" onClick={deleteProduct}><TrashIcon /> Удалить продукт</button>}
            </div>
          </form>
        );

      case "list":
        return (
          <form className="sheet-form" onSubmit={submitListName}>
            {closeButton}
            {field("Название списка", <KeyboardInput placeholder="Например, покупки на выходные" value={listName} onChange={(event) => setListName(event.target.value)} onBlur={() => keyboard.hide()} />)}
            <button className="primary-button" disabled={!listName.trim()}>{sheet.listId ? "Сохранить" : "Создать список"}</button>
            {!sheet.listId && alive(data.templates).length > 0 && (
              <section className="sheet-section">
                <p className="settings-label">ШАБЛОНЫ</p>
                <div className="chip-wrap">
                  {alive(data.templates).map((template: Template) => (
                    <span className="chip" key={template.id}>
                      <button type="button" onClick={() => addList(addProducts(newList(template.name), template.items))}><BookmarkIcon /> {template.name} <small>{template.items.length}</small></button>
                      <button type="button" aria-label={`Удалить шаблон ${template.name}`} onClick={() => removeEntity("templates", template.id, "Шаблон удалён")}><Cross2Icon /></button>
                    </span>
                  ))}
                </div>
              </section>
            )}
          </form>
        );

      case "actions": {
        const list = sheetList;
        if (!list) return null;
        const sharing = data.sharing[list.id];
        const action = (icon: ReactNode, label: string, onClick: () => void, detail?: string, danger = false) => (
          <button type="button" className={`setting-row action-row ${danger ? "action-danger" : ""}`} onClick={onClick}><span className="setting-icon">{icon}</span><span><b>{label}</b>{detail && <small>{detail}</small>}</span><ChevronRightIcon /></button>
        );
        return (
          <div className="sheet-form action-list">
            {closeButton}
            {action(<Pencil1Icon />, "Переименовать", () => { setListName(list.name); openSheet({ kind: "list", listId: list.id }); })}
            {action(<PersonIcon />, "Вести вместе", () => openShare(list), sharing ? `Участников: ${sharing.members}` : "Пригласить по ссылке или почте")}
            {action(<Share1Icon />, "Отправить текстом", () => void sendAsText(list), "В мессенджер или заметки")}
            {action(<BellIcon />, "Напоминание", () => { setReminderValue(toLocalInput(list.remindAt ?? at(1, 10))); openSheet({ kind: "reminder", listId: list.id }); }, list.remindAt ? formatReminder(list.remindAt) : "Не задано")}
            {action(<MixIcon />, "Магазин", () => openSheet({ kind: "store-pick", listId: list.id }), storeName(list) ?? "Не выбран")}
            {action(<BookmarkIcon />, "Сохранить как шаблон", () => saveAsTemplate(list))}
            {action(<ArchiveIcon />, "Завершить", () => completeList(list), "Перенести в историю")}
            {action(sharing && !sharing.owner ? <ExitIcon /> : <TrashIcon />, sharing && !sharing.owner ? "Покинуть список" : sharing ? "Удалить у всех участников" : "Удалить список", () => deleteList(list), undefined, true)}
          </div>
        );
      }

      case "share": {
        const list = sheetList;
        if (!list) return null;
        if (!cloud.email) {
          return (
            <div className="sheet-form">
              {closeButton}
              <p className="sheet-text">Чтобы вести список вместе, войдите в аккаунт — так приложение сможет передавать изменения между участниками.</p>
              <button type="button" className="primary-button" onClick={() => openAccount("login")}><PersonIcon /> Войти или создать аккаунт</button>
            </div>
          );
        }
        return (
          <div className="sheet-form">
            {closeButton}
            {shareState.link ? (
              <div className="share-link">
                <span>{shareState.link}</span>
                <div className="share-link-actions">
                  <button type="button" className="primary-button" onClick={() => void shareText(list.name, `Присоединяйтесь к моему списку покупок «${list.name}»: ${shareState.link}`).then((result) => { if (result === "copied") notify("Ссылка скопирована"); })}><Share1Icon /> Отправить</button>
                  <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(shareState.link).then(() => notify("Ссылка скопирована"), () => undefined)}><CopyIcon /> Копировать</button>
                </div>
                <small>Ссылка действует 7 дней. По ней можно войти или создать аккаунт и сразу попасть в список.</small>
              </div>
            ) : (
              <button type="button" className="primary-button" disabled={busy} onClick={() => void run(async () => { const { link } = await cloud.share.invite(list.id); setShareState((previous) => ({ ...previous, link })); })}><Link2Icon /> {busy ? "Подождите…" : "Создать ссылку-приглашение"}</button>
            )}
            {cloud.config.email && (
              <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await cloud.share.invite(list.id, shareState.email); setShareState((previous) => ({ ...previous, email: "" })); notify("Приглашение отправлено"); }); }}>
                {field("Пригласить по почте", <KeyboardInput type="email" inputMode="email" autoCapitalize="none" placeholder="name@example.com" value={shareState.email} onChange={(event) => { const email = event.target.value; setShareState((previous) => ({ ...previous, email })); }} onBlur={() => keyboard.hide()} />)}
                <button className="secondary-button" disabled={busy || !shareState.email.trim()}><EnvelopeClosedIcon /> Отправить</button>
              </form>
            )}
            {errorBox}
            {shareState.members.length > 0 && (
              <section className="sheet-section">
                <p className="settings-label">УЧАСТНИКИ</p>
                {shareState.members.map((member) => <div className="member-row" key={member.email}><PersonIcon /> <span>{member.email}</span> <small>{member.you ? "вы" : member.owner ? "создатель" : ""}</small></div>)}
              </section>
            )}
          </div>
        );
      }

      case "reminder": {
        const list = sheetList;
        if (!list) return null;
        const presets: [string, number][] = [["Через час", Date.now() + 3_600_000], ["Сегодня, 18:00", at(0, 18)], ["Завтра, 10:00", at(1, 10)], ["В пятницу, 18:00", nextWeekday(5, 18)], ["В субботу, 10:00", nextWeekday(6, 10)]];
        return (
          <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); setReminder(list.id, new Date(reminderValue).getTime()); }}>
            {closeButton}
            <div className="chip-wrap">
              {presets.filter(([, time]) => time > Date.now()).map(([label, time]) => <button type="button" className="chip-button" key={label} onClick={() => setReminder(list.id, time)}>{label}</button>)}
            </div>
            {field("Своё время", <KeyboardInput type="datetime-local" value={reminderValue} onChange={(event) => setReminderValue(event.target.value)} onBlur={() => keyboard.hide()} />)}
            {errorBox}
            <div className="sheet-actions">
              <button className="primary-button" disabled={!reminderValue}><BellIcon /> Напомнить</button>
              {list.remindAt && <button type="button" className="destructive-button" onClick={() => setReminder(list.id, undefined)}>Убрать напоминание</button>}
            </div>
          </form>
        );
      }

      case "store-pick": {
        const list = sheetList;
        if (!list) return null;
        return (
          <div className="sheet-form action-list">
            {closeButton}
            <button type="button" className={`pick-row ${!list.storeId ? "pick-active" : ""}`} onClick={() => { patchList(list.id, { storeId: undefined }); closeSheet(); }}>Без магазина <small>обычный порядок категорий</small></button>
            {alive(data.stores).map((store) => (
              <button type="button" key={store.id} className={`pick-row ${list.storeId === store.id ? "pick-active" : ""}`} onClick={() => { patchList(list.id, { storeId: store.id }); closeSheet(); notify(`Порядок как в «${store.name}»`); }}>{store.name}</button>
            ))}
            <button type="button" className="secondary-button" onClick={() => openStore(undefined, list.id)}><PlusIcon /> Новый магазин</button>
          </div>
        );
      }

      case "pick-list":
        return (
          <div className="sheet-form action-list">
            {closeButton}
            {activeLists.map((list) => <button type="button" key={list.id} className="pick-row" onClick={() => addProductsTo(list.id, sheet.products, sheet.title)}>{list.name} <small>{progress(list).left} осталось купить</small></button>)}
            <button type="button" className="secondary-button" onClick={() => addProductsTo(null, sheet.products, sheet.title)}><PlusIcon /> Новый список «{sheet.title}»</button>
          </div>
        );

      case "recipe": {
        const recipe = sheet.recipeId ? data.recipes.find((entry) => entry.id === sheet.recipeId) : undefined;
        return (
          <form className="sheet-form" onSubmit={saveRecipe}>
            {closeButton}
            {field("Название", <KeyboardInput placeholder="Например, борщ" value={recipeForm.name} onChange={(event) => { const name = event.target.value; setRecipeForm((previous) => ({ ...previous, name })); }} onBlur={() => keyboard.hide()} />)}
            {field("Ингредиенты", <KeyboardTextarea rows={6} placeholder={"Свёкла 2 шт.\nКартофель 500 г\nСметана"} value={recipeForm.ingredients} onChange={(event) => { const ingredients = event.target.value; setRecipeForm((previous) => ({ ...previous, ingredients })); }} onBlur={() => keyboard.hide()} />)}
            {field(<>Как готовить <span>Необязательно</span></>, <KeyboardTextarea rows={3} value={recipeForm.note} onChange={(event) => { const note = event.target.value; setRecipeForm((previous) => ({ ...previous, note })); }} onBlur={() => keyboard.hide()} />)}
            <div className="sheet-actions">
              <button className="primary-button" disabled={!recipeForm.name.trim()}>Сохранить рецепт</button>
              {recipe && <button type="button" className="secondary-button" onClick={() => addToSomeList(recipe.name, recipe.ingredients)}><PlusIcon /> Добавить ингредиенты в список</button>}
              {recipe && <button type="button" className="destructive-button" onClick={() => { closeSheet(); removeEntity("recipes", recipe.id, "Рецепт удалён"); }}><TrashIcon /> Удалить рецепт</button>}
            </div>
          </form>
        );
      }

      case "store":
        return (
          <form className="sheet-form" onSubmit={saveStore}>
            {closeButton}
            {field("Название", <KeyboardInput placeholder="Например, магазин у дома" value={storeForm.name} onChange={(event) => { const name = event.target.value; setStoreForm((previous) => ({ ...previous, name })); }} onBlur={() => keyboard.hide()} />)}
            <p className="settings-label">ПОРЯДОК ОТДЕЛОВ</p>
            <Sortable
              className="order-list"
              items={storeForm.order}
              getKey={(name) => name}
              onReorder={(from, to) => setStoreForm((previous) => ({ ...previous, order: moveItem(previous.order, from, to) }))}
              render={(name, handle, dragging) => <div className={`order-row ${dragging ? "order-dragging" : ""}`}><span className="drag-handle" {...handle}><DragHandleDots2Icon /></span>{name}</div>}
            />
            <div className="sheet-actions">
              <button className="primary-button" disabled={!storeForm.name.trim()}>Сохранить магазин</button>
              {sheet.storeId && <button type="button" className="destructive-button" onClick={() => { const id = sheet.storeId!; closeSheet(); removeEntity("stores", id, "Магазин удалён"); }}><TrashIcon /> Удалить магазин</button>}
            </div>
          </form>
        );

      case "categories":
        return (
          <form className="sheet-form" onSubmit={addCategory}>
            {closeButton}
            <div className="inline-form">
              {field("Новая категория", <KeyboardInput placeholder="Например, для питомца" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} onBlur={() => keyboard.hide()} />)}
              <button className="secondary-button" disabled={!categoryName.trim()}><PlusIcon /> Добавить</button>
            </div>
            {errorBox}
            <div className="chip-wrap">
              {categories.map((name) => {
                const custom = alive(data.categories).find((category) => category.name === name);
                return <span className={`chip ${custom ? "" : "chip-fixed"}`} key={name}><span>{name}</span>{custom && <button type="button" aria-label={`Удалить категорию ${name}`} onClick={() => removeEntity("categories", custom.id, "Категория удалена")}><Cross2Icon /></button>}</span>;
              })}
            </div>
          </form>
        );

      case "account": {
        const { step } = sheet;
        const setCredential = (key: keyof typeof credentials, value: string) => setCredentials((previous) => ({ ...previous, [key]: value }));
        const emailInput = field("Почта", <KeyboardInput type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="name@example.com" value={credentials.email} onChange={(event) => setCredential("email", event.target.value)} onBlur={() => keyboard.hide()} />);
        const passwordInput = (label: string, autoComplete: string) => field(label, <KeyboardInput type="password" autoComplete={autoComplete} placeholder="Не короче 8 символов" value={credentials.password} onChange={(event) => setCredential("password", event.target.value)} onBlur={() => keyboard.hide()} />);
        const codeInput = field("Код из письма", <KeyboardInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={credentials.code} onChange={(event) => setCredential("code", event.target.value.replace(/\D/g, ""))} onBlur={() => keyboard.hide()} />);
        const submitLabel = { login: "Войти", register: "Создать аккаунт", verify: "Подтвердить", forgot: "Отправить код", reset: "Сохранить пароль" }[step];
        const canSubmit = {
          login: credentials.email.trim() && credentials.password,
          register: credentials.email.trim() && credentials.password,
          verify: credentials.code.length === 6,
          forgot: credentials.email.trim(),
          reset: credentials.code.length === 6 && credentials.password,
        }[step];
        return (
          <form className="sheet-form" onSubmit={submitAccount}>
            {closeButton}
            {(step === "login" || step === "register" || step === "forgot") && emailInput}
            {(step === "verify" || step === "reset") && codeInput}
            {step === "login" && passwordInput("Пароль", "current-password")}
            {step === "register" && passwordInput("Пароль", "new-password")}
            {step === "reset" && passwordInput("Новый пароль", "new-password")}
            {errorBox}
            <div className="sheet-actions">
              <button className="primary-button" disabled={busy || !canSubmit}>{busy ? "Подождите…" : submitLabel}</button>
              {step === "login" && <button type="button" className="text-action account-switch" onClick={() => openAccount("register")}>Создать новый аккаунт</button>}
              {step === "register" && <button type="button" className="text-action account-switch" onClick={() => openAccount("login")}>У меня уже есть аккаунт</button>}
              {step === "login" && cloud.config.email && <button type="button" className="text-action account-switch" onClick={() => openAccount("forgot")}>Забыли пароль?</button>}
              {step === "verify" && <button type="button" className="text-action account-switch" disabled={busy} onClick={() => void run(() => cloud.account.resendVerification(), () => notify("Новый код отправлен"))}>Отправить код ещё раз</button>}
              {step === "verify" && <button type="button" className="text-action account-switch" onClick={closeSheet}>Подтвержу позже</button>}
              {(step === "forgot" || step === "reset") && <button type="button" className="text-action account-switch" onClick={() => openAccount("login")}>Вернуться ко входу</button>}
            </div>
            {(step === "login" || step === "register") && cloud.config.googleClientId && (
              <div className="google-block">
                <span className="divider-text">или</span>
                {isNativeApp
                  ? <button type="button" className="secondary-button google-button" onClick={() => void run(() => cloud.account.startAppGoogleLogin())}><span className="google-mark">G</span> Продолжить с Google</button>
                  : <div ref={googleButton} className="google-slot" />}
              </div>
            )}
          </form>
        );
      }

      case "password":
        return (
          <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); void run(() => cloud.account.changePassword(credentials.current, credentials.password), () => { closeSheet(); notify("Пароль сохранён"); }); }}>
            {closeButton}
            {cloud.hasPassword && field("Текущий пароль", <KeyboardInput type="password" autoComplete="current-password" value={credentials.current} onChange={(event) => { const current = event.target.value; setCredentials((previous) => ({ ...previous, current })); }} onBlur={() => keyboard.hide()} />)}
            {field("Новый пароль", <KeyboardInput type="password" autoComplete="new-password" placeholder="Не короче 8 символов" value={credentials.password} onChange={(event) => { const password = event.target.value; setCredentials((previous) => ({ ...previous, password })); }} onBlur={() => keyboard.hide()} />)}
            {errorBox}
            <button className="primary-button" disabled={busy || credentials.password.length < 8 || (cloud.hasPassword && !credentials.current)}>{busy ? "Подождите…" : "Сохранить пароль"}</button>
          </form>
        );

      case "delete-account":
        return (
          <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); void run(() => cloud.account.deleteAccount(credentials.password), () => { closeSheet(); notify("Аккаунт удалён"); }); }}>
            {closeButton}
            <p className="sheet-text">Совместные списки останутся у других участников. Отменить удаление нельзя.</p>
            {cloud.hasPassword && field("Пароль для подтверждения", <KeyboardInput type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => { const password = event.target.value; setCredentials((previous) => ({ ...previous, password })); }} onBlur={() => keyboard.hide()} />)}
            {errorBox}
            <button className="danger-button" disabled={busy || (cloud.hasPassword && !credentials.password)}><TrashIcon /> {busy ? "Подождите…" : "Удалить аккаунт навсегда"}</button>
          </form>
        );
    }
  }

  // --- Screens -------------------------------------------------------------------------------------

  const productRow = (item: ShoppingItem, handle?: DragHandle) => (
    <ProductRow
      item={item}
      handle={handle}
      onToggle={() => currentList && patchItem(currentList.id, item.id, { purchased: !item.purchased })}
      onEdit={() => openProductSheet(item)}
      onFavorite={() => currentList && patchItem(currentList.id, item.id, { favorite: !item.favorite })}
    />
  );

  const { title: sheetTitle, description: sheetDescription } = sheetMeta();

  return (
    <div className={`shopping-app ${data.settings.darkMode ? "theme-dark" : ""}`} style={{ "--mobile-safe-area-height": `${bottomInset}px` } as CSSProperties}>
      {currentList ? (
        <>
          <MobileScroll className="app-screen">
            <main className="list-screen screen-content">
              <header className="brand-header">
                <button className="brand-home" aria-label="Назад к спискам" onClick={() => setCurrentListId(null)}>
                  <span className="brand-mark" aria-hidden="true"><BackpackIcon /></span>
                  <span>Корзина</span>
                </button>
                <button className="icon-button header-action" aria-label="Действия со списком" onClick={() => openSheet({ kind: "actions", listId: currentList.id })}><DotsHorizontalIcon /></button>
              </header>

              <div className="list-heading-row">
                <button className="back-button" aria-label="К спискам" onClick={() => setCurrentListId(null)}><ArrowLeftIcon /></button>
                <div className="list-heading-copy">
                  <p className="eyebrow">{data.sharing[currentList.id] ? "СОВМЕСТНЫЙ СПИСОК" : "СПИСОК ПОКУПОК"}</p>
                  <h1>{currentList.name}</h1>
                </div>
                <button className="icon-button" aria-label="Отправить список" onClick={() => void sendAsText(currentList)}><Share1Icon /></button>
              </div>
              {listBadges(currentList)}

              <section className="progress-block" aria-label="Прогресс покупок">
                <div className="progress-copy"><span>{progress(currentList).bought} из {progress(currentList).total} куплено</span><span>{Math.round(progress(currentList).percent)}%</span></div>
                <div className="progress-track"><span style={{ width: `${progress(currentList).percent}%` }} /></div>
              </section>

              <div className="list-tools">
                <div className="search-field"><MagnifyingGlassIcon /><KeyboardInput aria-label="Поиск продуктов" placeholder="Найти продукт" value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => keyboard.hide()} /></div>
                <button className={`sort-chip ${currentList.sortMode === "manual" ? "sort-chip-active" : ""}`} onClick={toggleSortMode}>{currentList.sortMode === "manual" ? "Свой порядок" : storeName(currentList) ?? "По категориям"}</button>
              </div>

              <section className="items-section" aria-label="Осталось купить">
                {filteredItems.length ? (
                  manual
                    ? <Sortable className="item-list" items={filteredItems} getKey={(item) => item.id} onReorder={(from, to) => reorder(filteredItems, from, to)} render={(item, handle) => productRow(item, handle)} />
                    : <div className="item-list">{filteredItems.map((item) => <div key={item.id}>{productRow(item)}</div>)}</div>
                ) : <div className="empty-search">{query ? "Ничего не найдено" : "Все покупки сделаны. Добавьте что-нибудь ещё."}</div>}
              </section>

              {purchasedItems.length > 0 && (
                <section className="purchased-section">
                  <button className="purchased-toggle" onClick={() => setShowPurchased((value) => !value)}>
                    <span><CheckIcon /> Купленные <b>{purchasedItems.length}</b></span><ChevronDownIcon className={showPurchased ? "chevron-open" : ""} />
                  </button>
                  {showPurchased && <div className="item-list purchased-list">{purchasedItems.map((item) => <div key={item.id}>{productRow(item)}</div>)}</div>}
                  <button className="clear-button" onClick={clearPurchased}><TrashIcon /> Очистить купленное</button>
                </section>
              )}
              {progress(currentList).total > 0 && progress(currentList).left === 0 && <button className="secondary-button complete-button" onClick={() => completeList(currentList)}><ArchiveIcon /> Завершить список</button>}
              <div className="bottom-spacer" />
            </main>
          </MobileScroll>
          <form className="quick-add-bar" onSubmit={quickAdd}>
            {hints.length > 0 && (
              <div className="suggestion-row" aria-label="Подсказки">
                {hints.map((product) => <button type="button" key={product.name} className="suggestion-chip" onPointerDown={(event) => event.preventDefault()} onClick={() => addQuick(product)}><PlusIcon /> {product.name} <small>{product.quantity} {product.unit}</small></button>)}
              </div>
            )}
            <KeyboardInput aria-label="Добавить продукт" placeholder="Добавить продукт" value={quickName} onChange={(event) => setQuickName(event.target.value)} onBlur={() => keyboard.hide()} />
            <button className="quick-add-button" aria-label="Добавить продукт"><PlusIcon /></button>
            <button type="button" className="quick-add-more" aria-label="Подробно добавить продукт" onClick={() => openProductSheet()}><Pencil1Icon /></button>
          </form>
        </>
      ) : (
        <>
          <MobileScroll className="app-screen">
            <main className="home-screen screen-content">
              <header className="brand-header">
                <div className="brand-home"><span className="brand-mark" aria-hidden="true"><BackpackIcon /></span><span>Корзина</span></div>
                <button className="icon-button header-action" aria-label="Настройки" onClick={() => setTab("settings")}><GearIcon /></button>
              </header>

              {tab === "lists" && <>
                <section className="welcome-block">
                  <p className="eyebrow">ВАШИ ПОКУПКИ</p>
                  <h1>Пора за покупками?</h1>
                  <p className="welcome-subtitle">Соберите всё нужное в одном месте.</p>
                </section>
                <div className="section-title-row"><h2>Мои списки <span>{activeLists.length}</span></h2><button className="text-action" onClick={startNewList}><PlusIcon /> Новый</button></div>
                {activeLists.length === 0 ? <EmptyState title="Пока нет списков" text="Создайте список и добавьте туда первые покупки." action={startNewList} /> : (
                  <div className="shopping-lists">
                    {activeLists.map((list, index) => (
                      <div className={`list-card list-card-${index % 3}`} key={list.id}>
                        <button className="list-card-main" onClick={() => openList(list.id)}>
                          <div className="list-card-top"><span className="list-symbol">{index % 3 === 0 ? <ArchiveIcon /> : index % 3 === 1 ? <BackpackIcon /> : <CalendarIcon />}</span><span className="list-card-progress">{progress(list).bought}/{progress(list).total}</span></div>
                          <strong>{list.name}</strong>
                          <span className="list-card-meta">{progress(list).total ? (progress(list).left ? `${progress(list).left} осталось купить` : "Всё куплено") : "Пока пусто"}</span>
                          {listBadges(list)}
                          <div className="mini-progress"><span style={{ width: `${progress(list).percent}%` }} /></div>
                        </button>
                        <button className="list-card-menu" aria-label={`Действия со списком ${list.name}`} onClick={() => openSheet({ kind: "actions", listId: list.id })}><DotsHorizontalIcon /></button>
                      </div>
                    ))}
                  </div>
                )}
                <button className="create-list-button" onClick={startNewList}><span className="create-list-icon"><PlusIcon /></span><span><b>Создать новый список</b><small>{alive(data.templates).length ? "С нуля или из шаблона" : "Для магазина, дома или рецепта"}</small></span><ChevronRightIcon /></button>
                {activeLists.length > 0 && <section className="home-tip"><span className="tip-mark"><StarFilledIcon /></span><p>Нажмите «⋯» на карточке, чтобы пригласить близких, поставить напоминание или выбрать магазин.</p></section>}
              </>}

              {tab === "favorites" && <>
                <section className="welcome-block compact-welcome"><p className="eyebrow">БЫСТРЫЙ ДОСТУП</p><h1>Избранное</h1><p className="welcome-subtitle">Часто покупаемые продукты.</p></section>
                {favorites.length ? <div className="favorite-list">{favorites.map((item) => (
                  <div className="favorite-row" key={item.id}>
                    <button className="favorite-row-main" onClick={() => openList(item.listId)}><span className="favorite-star"><StarFilledIcon /></span><span><b>{item.name}</b><small>{item.listName} · {item.quantity} {item.unit}</small></span></button>
                    <button className="favorite-add" aria-label={`Добавить ${item.name} в список`} onClick={() => addToSomeList(item.name, [{ ...toProduct(item), quantity: "1" }])}><PlusIcon /></button>
                  </div>
                ))}</div> : <EmptyState title="Здесь будут ваши любимые продукты" text="Нажмите на звёздочку рядом с продуктом, чтобы сохранить его." />}
              </>}

              {tab === "recipes" && <>
                <section className="welcome-block compact-welcome"><p className="eyebrow">ГОТОВИМ ДОМА</p><h1>Рецепты</h1><p className="welcome-subtitle">Ингредиенты попадают в список одним касанием.</p></section>
                <div className="section-title-row"><h2>Мои рецепты <span>{alive(data.recipes).length}</span></h2><button className="text-action" onClick={() => openRecipe()}><PlusIcon /> Новый</button></div>
                {alive(data.recipes).length ? <div className="history-list">{alive(data.recipes).map((recipe) => (
                  <div className="history-row recipe-row" key={recipe.id}>
                    <button className="favorite-row-main" onClick={() => openRecipe(recipe)}><span className="history-icon"><ReaderIcon /></span><span><b>{recipe.name}</b><small>{recipe.ingredients.map((entry) => entry.name).join(", ") || "Без ингредиентов"}</small></span></button>
                    <button className="history-repeat" onClick={() => addToSomeList(recipe.name, recipe.ingredients)}>В список</button>
                  </div>
                ))}</div> : <EmptyState title="Пока нет рецептов" text="Добавьте рецепт, чтобы потом одним касанием перенести ингредиенты в список." />}
              </>}

              {tab === "history" && <>
                <section className="welcome-block compact-welcome"><p className="eyebrow">ЗАВЕРШЁННЫЕ ПОКУПКИ</p><h1>История</h1><p className="welcome-subtitle">Списки, которые вы завершили.</p></section>
                {history.length ? <div className="history-list">{history.map((list) => (
                  <button key={list.id} className="history-row" onClick={() => repeatList(list)}><span className="history-icon"><ClockIcon /></span><span><b>{list.name}</b><small>{alive(list.items).length} продуктов · {new Date(list.completedAt ?? list.updatedAt).toLocaleDateString("ru-RU")}</small></span><span className="history-repeat">Повторить</span></button>
                ))}</div> : <EmptyState title="История пока пуста" text="Завершите список покупок, чтобы он появился здесь." />}
              </>}

              {tab === "settings" && <>
                <section className="welcome-block compact-welcome"><p className="eyebrow">ПЕРСОНАЛИЗАЦИЯ</p><h1>Настройки</h1><p className="welcome-subtitle">Подстройте приложение под себя.</p></section>
                <section className="settings-group"><p className="settings-label">ВНЕШНИЙ ВИД</p><button className="setting-row" onClick={() => change((previous) => ({ ...previous, settings: { darkMode: !previous.settings.darkMode, updatedAt: Date.now() } }))}><span className="setting-icon">{data.settings.darkMode ? <MoonIcon /> : <SunIcon />}</span><span><b>{data.settings.darkMode ? "Тёмная тема" : "Светлая тема"}</b><small>Нажмите, чтобы переключить оформление</small></span><span className={`theme-switch ${data.settings.darkMode ? "switch-on" : ""}`}><i /></span></button></section>

                <section className="settings-group"><p className="settings-label">АККАУНТ</p>
                  {cloud.email ? <div className="settings-stack">
                    <div className="setting-row static-row"><span className="setting-icon"><PersonIcon /></span><span><b>{cloud.email}</b><small>Списки сохраняются в аккаунте</small></span><span className={`local-badge ${cloud.status === "error" ? "badge-warning" : ""}`}>{syncLabel}</span></div>
                    {!cloud.verified && cloud.config.email && <button className="setting-row" onClick={() => { openAccount("verify"); void cloud.account.resendVerification().then(() => notify("Код отправлен на почту"), (error) => setFormError(errorText(error))); }}><span className="setting-icon setting-warning"><EnvelopeClosedIcon /></span><span><b>Подтвердите почту</b><small>Нужно, чтобы приглашать людей письмом</small></span><ChevronRightIcon /></button>}
                    <button className="setting-row" onClick={() => { setCredentials((previous) => ({ ...previous, password: "", current: "" })); openSheet({ kind: "password" }); }}><span className="setting-icon"><LockClosedIcon /></span><span><b>{cloud.hasPassword ? "Сменить пароль" : "Задать пароль"}</b><small>{cloud.hasPassword ? "Другие устройства выйдут из аккаунта" : "Чтобы входить без Google"}</small></span><ChevronRightIcon /></button>
                    <div className="settings-buttons">
                      <button className="destructive-button" onClick={() => { cloud.account.signOut(); notify("Вы вышли из аккаунта"); }}><ExitIcon /> Выйти из аккаунта</button>
                      <button className="destructive-button" onClick={() => { setCredentials((previous) => ({ ...previous, password: "" })); openSheet({ kind: "delete-account" }); }}><TrashIcon /> Удалить аккаунт</button>
                    </div>
                  </div> : <button className="setting-row" onClick={() => openAccount("login")}><span className="setting-icon"><PersonIcon /></span><span><b>Войти или создать аккаунт</b><small>Чтобы списки были на всех устройствах и их можно было вести вместе</small></span><ChevronRightIcon /></button>}
                </section>

                <section className="settings-group"><p className="settings-label">МАГАЗИНЫ</p>
                  <div className="settings-stack">
                    {alive(data.stores).map((store) => <button className="setting-row" key={store.id} onClick={() => openStore(store)}><span className="setting-icon"><MixIcon /></span><span><b>{store.name}</b><small>{store.categoryOrder.slice(0, 3).join(" → ")}…</small></span><ChevronRightIcon /></button>)}
                    <button className="setting-row" onClick={() => openStore()}><span className="setting-icon"><PlusIcon /></span><span><b>Добавить магазин</b><small>Порядок отделов, в котором вы их обходите</small></span><ChevronRightIcon /></button>
                  </div>
                </section>

                <section className="settings-group"><p className="settings-label">КАТЕГОРИИ</p>
                  <button className="setting-row" onClick={() => { setCategoryName(""); openSheet({ kind: "categories" }); }}><span className="setting-icon"><BookmarkIcon /></span><span><b>Свои категории</b><small>{alive(data.categories).length ? alive(data.categories).map((category) => category.name).join(", ") : "Добавьте свои группы продуктов"}</small></span><ChevronRightIcon /></button>
                </section>

                <div className="settings-note">{cloud.email ? "Списки хранятся на этом устройстве и в вашем аккаунте. Без интернета приложение продолжает работать, изменения сохранятся при следующем подключении." : "Сейчас покупки сохраняются только на этом устройстве. Войдите в аккаунт, чтобы они не потерялись и были доступны на других устройствах."}</div>
              </>}
              <div className="bottom-spacer" />
            </main>
          </MobileScroll>
          <nav className="bottom-nav" aria-label="Основная навигация">
            <NavButton active={tab === "lists"} icon={<HomeIcon />} label="Списки" onClick={() => setTab("lists")} />
            <NavButton active={tab === "favorites"} icon={<StarIcon />} label="Избранное" onClick={() => setTab("favorites")} />
            <NavButton active={tab === "recipes"} icon={<ReaderIcon />} label="Рецепты" onClick={() => setTab("recipes")} />
            <NavButton active={tab === "history"} icon={<ClockIcon />} label="История" onClick={() => setTab("history")} />
            <NavButton active={tab === "settings"} icon={<GearIcon />} label="Настройки" onClick={() => setTab("settings")} />
          </nav>
        </>
      )}

      <BottomSheet open={sheet !== null} onOpenChange={(open) => { if (!open) closeSheet(); }} title={sheetTitle} description={sheetDescription} snap={0.84}>
        {renderSheet()}
      </BottomSheet>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && <button className="toast-undo" onClick={undo}>Отменить</button>}
          <button onClick={() => setToast(null)} aria-label="Закрыть"><Cross2Icon /></button>
        </div>
      )}
    </div>
  );
}

function ProductRow({ item, handle, onToggle, onEdit, onFavorite }: { item: ShoppingItem; handle?: DragHandle; onToggle: () => void; onEdit: () => void; onFavorite: () => void }) {
  const image = productImages[item.name.toLocaleLowerCase("ru")];
  return <div className={`product-row ${item.purchased ? "product-row-done" : ""}`}>
    {handle && <span className="drag-handle" aria-label={`Перетащить ${item.name}`} {...handle}><DragHandleDots2Icon /></span>}
    <button className={`check-button ${item.purchased ? "checked" : ""}`} onClick={onToggle} aria-label={item.purchased ? `Вернуть ${item.name} в список` : `Отметить ${item.name} купленным`}>{item.purchased && <CheckIcon />}</button>
    {image ? <img className="product-art" src={image} alt="" /> : <span className="product-art product-art-placeholder" aria-hidden="true">{item.name.slice(0, 1).toLocaleUpperCase("ru")}</span>}
    <button className="product-main" onClick={onEdit}><span className="product-name">{item.name}</span><small className="product-note">{[item.category, item.note].filter(Boolean).join(" · ")}</small></button>
    <span className="product-quantity">{item.quantity} {item.unit}</span>
    <button className={`favorite-button ${item.favorite ? "favorite-active" : ""}`} onClick={onFavorite} aria-label={item.favorite ? "Убрать из избранного" : "В избранное"}>{item.favorite ? <StarFilledIcon /> : <StarIcon />}</button>
  </div>;
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? "nav-active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><span>{icon}</span><small>{label}</small></button>;
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><HeartIcon /></span><h3>{title}</h3><p>{text}</p>{action && <button className="primary-button" onClick={action}><PlusIcon /> Создать список</button>}</div>;
}
