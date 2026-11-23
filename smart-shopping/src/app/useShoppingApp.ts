// State of the whole app and every action the screens and sheets can take. The views in this
// folder only render what this hook returns and call its actions.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useKeyboard } from "../mobile";
import { useCloudSync, type Member } from "../cloud-sync";
import { allowReminders, isNativeApp, onReminderOpened, renderGoogleButton, scheduleReminders, shareText, updateWidget } from "../device";
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
  type Product,
  type Recipe,
  type ShoppingData,
  type ShoppingItem,
  type ShoppingList,
  type Store,
} from "../model";
import { loadShoppingData, saveShoppingData } from "../shopping-data";
import { moveItem } from "../sortable";
import { blankProduct, errorText, inviteFromAddress, type AccountStep, type Sheet, type Tab, type Toast } from "./types";

export type ShoppingApp = ReturnType<typeof useShoppingApp>;

export function useShoppingApp() {
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

  function toggleDarkMode() {
    change((previous) => ({ ...previous, settings: { darkMode: !previous.settings.darkMode, updatedAt: Date.now() } }));
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

  function openCategories() {
    setCategoryName("");
    openSheet({ kind: "categories" });
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

  function setCredential(key: keyof typeof credentials, value: string) {
    setCredentials((previous) => ({ ...previous, [key]: value }));
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

  function openPasswordSheet() {
    setCredentials((previous) => ({ ...previous, password: "", current: "" }));
    openSheet({ kind: "password" });
  }

  function openDeleteAccount() {
    setCredentials((previous) => ({ ...previous, password: "" }));
    openSheet({ kind: "delete-account" });
  }

  function startVerification() {
    openAccount("verify");
    void cloud.account.resendVerification().then(() => notify("Код отправлен на почту"), (error) => setFormError(errorText(error)));
  }

  function signOut() {
    cloud.account.signOut();
    notify("Вы вышли из аккаунта");
  }

  function openShare(list: ShoppingList) {
    setShareState({ link: "", email: "", members: [] });
    openSheet({ kind: "share", listId: list.id });
    if (cloud.email && data.sharing[list.id]) cloud.share.members(list.id).then((members) => setShareState((previous) => ({ ...previous, members })), () => undefined);
  }

  // --- Derived view data ---------------------------------------------------------------------------

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
  const hints = suggestions(data, quickName, currentList);

  return {
    // State
    data, tab, setTab, query, setQuery, sheet, form, setForm, listName, setListName, quickName, setQuickName,
    showPurchased, setShowPurchased, toast, setToast, recipeForm, setRecipeForm, storeForm, setStoreForm,
    categoryName, setCategoryName, reminderValue, setReminderValue, credentials, setCredential, formError, busy,
    shareState, setShareState, googleButton, keyboard, cloud,
    // Derived
    activeLists, history, categories, currentList, favorites, storeName, sheetList, hints,
    // Actions
    notify, undo, patchList, patchItem, removeEntity, toggleDarkMode, openSheet, closeSheet,
    openList, closeList: () => setCurrentListId(null), startNewList, addList, submitListName, deleteList, completeList, repeatList, saveAsTemplate, sendAsText,
    openProductSheet, saveProduct, addQuick, quickAdd, deleteProduct, clearPurchased, toggleSortMode, reorder, addProductsTo, addToSomeList,
    openRecipe, saveRecipe, openStore, saveStore, openCategories, addCategory, setReminder,
    openAccount, run, submitAccount, openPasswordSheet, openDeleteAccount, startVerification, signOut, openShare,
  };
}
