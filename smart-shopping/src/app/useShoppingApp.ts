// State of the whole app and every action the screens and sheets can take. The views in this
// folder only render what this hook returns and call its actions.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useKeyboard } from "../mobile";
import { useCloudSync, type FamilyInvite, type Member } from "../cloud-sync";
import { allowBrowserNotifications, allowReminders, exactAlarmsAllowed, isNativeApp, onNotificationOpened, openExactAlarmSettings, renderGoogleButton, scheduleReminders, shareText, updateWidget } from "../device";
import { forgetPhotosExcept, newPhotoId, savePhoto, shrinkPhoto } from "../photos";
import {
  addProducts,
  alive,
  categoryNames,
  categoryOrderFor,
  createId,
  emptyData,
  formatReminder,
  guessCategory,
  guessMinutes,
  listAsText,
  newList,
  parseProducts,
  productsAsText,
  progress,
  restore,
  sortItems,
  stepsAsNote,
  stepsOf,
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
import { blankProduct, errorText, inviteFromAddress, type AccountStep, type Invite, type RecipeForm, type Sheet, type Tab, type Toast } from "./types";
import { useTimers } from "./useTimers";
import { language, setLanguage, t, type Language } from "../i18n";

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
  const [recipeForm, setRecipeForm] = useState<RecipeForm>({ name: "", ingredients: "", steps: [] });
  // Cooking mode: the recipe being cooked and the step on screen.
  const [cooking, setCooking] = useState<{ recipeId: string; step: number } | null>(null);
  const [exactAlarms, setExactAlarms] = useState(true);
  // Changing it re-renders the whole app in the new language (src/i18n.ts).
  const [lang, setLang] = useState<Language>(language);
  const [storeForm, setStoreForm] = useState({ name: "", order: [] as string[] });
  const [categoryName, setCategoryName] = useState("");
  const [reminderValue, setReminderValue] = useState("");
  const [credentials, setCredentials] = useState({ email: "", password: "", code: "", current: "" });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareState, setShareState] = useState<{ link: string; email: string; members: Member[] }>({ link: "", email: "", members: [] });
  const [pendingInvite, setPendingInvite] = useState<Invite | null>(inviteFromAddress);
  const [familyState, setFamilyState] = useState<{ link: string; email: string; preview: FamilyInvite | null }>({ link: "", email: "", preview: null });
  const googleButton = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const keyboard = useKeyboard();
  const notify = useCallback((text: string) => setToast({ text }), []);
  const cloud = useCloudSync(data, setData, ready, notify);
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;
  const timers = useTimers((timer) => setToast({ text: t("Готово: {label}", { label: timer.label }) }));

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
    document.title = t("Корзина — список покупок");
  }, [lang]);

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
      else if (cooking !== null) setCooking(null);
      else if (currentListId !== null) setCurrentListId(null);
      else if (tab !== "lists") setTab("lists");
      else return;
      event.preventDefault();
    };
    window.addEventListener("app:back", onBack);
    return () => window.removeEventListener("app:back", onBack);
  }, [sheet, cooking, currentListId, tab]);

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
  useEffect(() => onNotificationOpened(
    (listId) => { setSheet(null); setCooking(null); setTab("lists"); setCurrentListId(listId); },
    (recipeId, stepId) => {
      const recipe = dataRef.current.recipes.find((entry) => entry.id === recipeId && !entry.deleted);
      if (!recipe) return;
      setSheet(null);
      setCooking({ recipeId, step: Math.max(0, stepsOf(recipe).findIndex((step) => step.id === stepId)) });
    },
  ), []);

  // Device copies of photos that no recipe uses any more are dropped once the data is loaded.
  useEffect(() => {
    if (ready) void forgetPhotosExcept(new Set(alive(dataRef.current.recipes).flatMap((recipe) => (recipe.photo ? [recipe.photo] : []))));
  }, [ready]);

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
        const familyInvite = url.searchParams.get("family");
        if (invite) setPendingInvite({ kind: "list", token: invite });
        else if (familyInvite) setPendingInvite({ kind: "family", token: familyInvite });
        const code = url.protocol === "korzina:" && url.host === "auth" ? url.searchParams.get("code") : null;
        if (code) {
          cloudRef.current.account.finishAppGoogleLogin(code).then(() => { setSheet(null); notify(t("Вы вошли через Google")); }, (error) => notify(errorText(error)));
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
      setFormError(pendingInvite.kind === "family" ? t("Войдите или создайте аккаунт, чтобы присоединиться к семье.") : t("Войдите или создайте аккаунт, чтобы присоединиться к списку."));
      return;
    }
    const { kind, token } = pendingInvite;
    setPendingInvite(null);
    if (kind === "family") {
      // Joining shares all of the user's lists, so it is confirmed first.
      setFamilyState((previous) => ({ ...previous, preview: null }));
      openSheet({ kind: "family-join", token });
      cloud.familyActions.preview(token).then((preview) => setFamilyState((previous) => ({ ...previous, preview })), (error) => setFormError(errorText(error)));
      return;
    }
    cloud.share.join(token).then(
      ({ listId, name }) => { setSheet(null); setTab("lists"); setCurrentListId(listId); notify(t("Вы присоединились к списку «{name}»", { name })); },
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
      cloudRef.current.account.googleCredential(credential).then(() => { setSheet(null); notify(t("Вы вошли через Google")); }, (error) => setFormError(errorText(error)));
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
    setToast({ text: t("Действие отменено") });
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
      notify(t("Название списка изменено"));
      closeSheet();
    } else {
      addList(newList(listName));
    }
  }

  function deleteList(list: ShoppingList) {
    setSheet(null);
    setCurrentListId(null);
    const sharing = data.sharing[list.id];
    // Someone else's list shared with the user alone is left; a family list is removed for all.
    if (sharing && !sharing.owner && !sharing.family) {
      cloud.share.leave(list.id).then(() => notify(t("Вы вышли из совместного списка")), (error) => notify(errorText(error)));
      return;
    }
    undoable(t("Список удалён"), (previous) => ({
      ...previous,
      lists: previous.lists.map((entry) => (entry.id === list.id ? { ...entry, deleted: true, updatedAt: Date.now() } : entry)),
    }));
  }

  function completeList(list: ShoppingList) {
    setSheet(null);
    setCurrentListId(null);
    undoable(t("Список перемещён в историю"), (previous) => ({
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
    notify(t("Шаблон «{name}» сохранён", { name: list.name }));
  }

  async function sendAsText(list: ShoppingList) {
    const result = await shareText(list.name, listAsText(list));
    if (result === "copied") notify(t("Список скопирован — вставьте его в сообщение"));
    if (result === "failed") notify(t("Не удалось отправить список"));
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
      notify(t("Изменения сохранены"));
    } else {
      editList(currentList.id, (list) => addProducts(list, [product]));
      notify(t("Добавлено в список"));
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
    notify(t("Добавлено в список"));
  }

  function deleteProduct() {
    if (!currentList || sheet?.kind !== "product" || !sheet.itemId) return;
    const { itemId } = sheet;
    const listId = currentList.id;
    undoable(t("Продукт удалён"), (previous) => ({
      ...previous,
      lists: previous.lists.map((list) => (list.id === listId ? { ...list, items: list.items.map((item) => (item.id === itemId ? { ...item, deleted: true, updatedAt: Date.now() } : item)) } : list)),
    }));
    closeSheet();
  }

  function clearPurchased() {
    if (!currentList) return;
    const listId = currentList.id;
    undoable(t("Купленные продукты очищены"), (previous) => ({
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
    notify(manual ? t("Перетаскивайте продукты за ручку слева") : t("Продукты сгруппированы по категориям"));
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
    notify(t("Продукты добавлены в список"));
  }

  function addToSomeList(title: string, products: Product[]) {
    if (currentList) addProductsTo(currentList.id, products, title);
    else if (activeLists.length === 0) addProductsTo(null, products, title);
    else openSheet({ kind: "pick-list", title, products });
  }

  // --- Profile -------------------------------------------------------------------------------------

  function openRecipe(recipe?: Recipe) {
    setRecipeForm(recipe
      ? { name: recipe.name, ingredients: productsAsText(recipe.ingredients), photo: recipe.photo, steps: stepsOf(recipe).map((step) => ({ id: step.id, text: step.text, minutes: step.minutes ? String(step.minutes) : "", auto: false })) }
      : { name: "", ingredients: "", steps: [{ id: createId(), text: "", minutes: "", auto: true }] });
    openSheet({ kind: "recipe", recipeId: recipe?.id });
  }

  function saveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sheet?.kind !== "recipe" || !recipeForm.name.trim()) return;
    const steps = recipeForm.steps
      .filter((step) => step.text.trim())
      .map((step) => {
        const minutes = Math.round(Number(step.minutes));
        return { id: step.id, text: step.text.trim(), ...(minutes > 0 ? { minutes: Math.min(minutes, 24 * 60) } : {}) };
      });
    saveEntity("recipes", {
      id: sheet.recipeId ?? createId(),
      name: recipeForm.name.trim(),
      note: stepsAsNote(steps),
      ingredients: parseProducts(recipeForm.ingredients, categories),
      steps,
      ...(recipeForm.photo ? { photo: recipeForm.photo } : {}),
      updatedAt: Date.now(),
    });
    closeSheet();
    notify(t("Рецепт сохранён"));
  }

  // Steps in the recipe form. Until the minutes of a step are typed by hand, they follow the
  // duration found in its text ("варить 10 минут").
  function editStep(stepId: string, patch: { text?: string; minutes?: string }) {
    setRecipeForm((previous) => ({
      ...previous,
      steps: previous.steps.map((step) => {
        if (step.id !== stepId) return step;
        if (patch.minutes !== undefined) return { ...step, minutes: patch.minutes.replace(/\D/g, "").slice(0, 4), auto: false };
        const text = patch.text ?? step.text;
        const guessed = guessMinutes(text);
        return { ...step, text, minutes: step.auto ? (guessed ? String(guessed) : "") : step.minutes };
      }),
    }));
  }

  function addStep() {
    setRecipeForm((previous) => ({ ...previous, steps: [...previous.steps, { id: createId(), text: "", minutes: "", auto: true }] }));
  }

  function removeStep(stepId: string) {
    setRecipeForm((previous) => ({ ...previous, steps: previous.steps.filter((step) => step.id !== stepId) }));
  }

  function moveStep(from: number, to: number) {
    setRecipeForm((previous) => ({ ...previous, steps: moveItem(previous.steps, from, to) }));
  }

  async function pickRecipePhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setFormError("");
    try {
      const id = newPhotoId();
      await savePhoto(id, await shrinkPhoto(file));
      setRecipeForm((previous) => ({ ...previous, photo: id }));
    } catch {
      setFormError(t("Не удалось открыть фото. Попробуйте другое."));
    } finally {
      setBusy(false);
    }
  }

  function removeRecipePhoto() {
    setRecipeForm((previous) => ({ ...previous, photo: undefined }));
  }

  // --- Cooking -------------------------------------------------------------------------------------

  function startCooking(recipe: Recipe) {
    closeSheet();
    setCooking({ recipeId: recipe.id, step: 0 });
    allowBrowserNotifications();
    void exactAlarmsAllowed().then(setExactAlarms);
  }

  function goToStep(step: number) {
    setCooking((previous) => (previous ? { ...previous, step } : previous));
  }

  function stopCooking() {
    setCooking(null);
  }

  async function startStepTimer(recipe: Recipe, index: number) {
    const step = stepsOf(recipe)[index];
    if (!step) return;
    const onTime = await timers.start(recipe, step, index);
    if (!onTime) setExactAlarms(await exactAlarmsAllowed());
  }

  async function allowExactAlarms() {
    setExactAlarms(await openExactAlarmSettings());
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
    notify(t("Магазин сохранён"));
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
      setFormError(t("Такая категория уже есть."));
      return;
    }
    saveEntity("categories", { id: createId(), name, updatedAt: Date.now() });
    setCategoryName("");
    setFormError("");
  }

  function setReminder(listId: string, time: number | undefined) {
    if (time !== undefined && !(time > Date.now())) {
      setFormError(t("Выберите время в будущем."));
      return;
    }
    patchList(listId, { remindAt: time });
    closeSheet();
    if (time === undefined) {
      notify(t("Напоминание убрано"));
      return;
    }
    allowReminders().then((allowed) =>
      notify(allowed ? t("Напомним {when}", { when: formatReminder(time) }) : t("Напоминание сохранено, но уведомления запрещены — разрешите их в настройках")),
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
        return void run(() => cloud.account.signIn("login", email, password), () => { closeSheet(); notify(t("Вы вошли в аккаунт")); });
      case "register":
        return void run(() => cloud.account.signIn("register", email, password), () => {
          if (cloud.config.email) openAccount("verify");
          else closeSheet();
          notify(t("Аккаунт создан"));
        });
      case "verify":
        return void run(() => cloud.account.verifyEmail(code), () => { closeSheet(); notify(t("Почта подтверждена")); });
      case "forgot":
        return void run(() => cloud.account.forgotPassword(email), () => { openAccount("reset"); notify(t("Если такой аккаунт есть, код уже в почте")); });
      case "reset":
        return void run(() => cloud.account.resetPassword(email, code, password), () => { closeSheet(); notify(t("Пароль изменён, вы вошли в аккаунт")); });
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
    void cloud.account.resendVerification().then(() => notify(t("Код отправлен на почту")), (error) => setFormError(errorText(error)));
  }

  function signOut() {
    cloud.account.signOut();
    notify(t("Вы вышли из аккаунта"));
  }

  function changeLanguage(next: Language) {
    setLanguage(next);
    setLang(next);
    closeSheet();
  }

  // --- Family ------------------------------------------------------------------------------------

  function openFamily() {
    setFamilyState({ link: "", email: "", preview: null });
    openSheet({ kind: "family" });
  }

  function joinFamily(token: string) {
    void run(() => cloud.familyActions.join(token), () => { closeSheet(); setTab("lists"); notify(t("Вы в семье — списки теперь общие")); });
  }

  function leaveFamily() {
    void run(() => cloud.familyActions.leave(), () => { closeSheet(); notify(t("Вы вышли из семьи")); });
  }

  // A personal list is seen only by its own members; any other list by the whole family.
  function togglePersonal(list: ShoppingList) {
    const personal = !list.personal;
    patchList(list.id, { personal });
    notify(personal ? t("Список стал личным — семья его не видит") : t("Список снова виден всей семье"));
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
  const cookingRecipe = cooking ? alive(data.recipes).find((recipe) => recipe.id === cooking.recipeId) ?? null : null;

  return {
    // State
    data, tab, setTab, query, setQuery, sheet, form, setForm, listName, setListName, quickName, setQuickName,
    showPurchased, setShowPurchased, toast, setToast, recipeForm, setRecipeForm, storeForm, setStoreForm,
    categoryName, setCategoryName, reminderValue, setReminderValue, credentials, setCredential, formError, busy,
    shareState, setShareState, familyState, setFamilyState, googleButton, keyboard, cloud,
    // Derived
    activeLists, history, categories, currentList, favorites, storeName, sheetList, hints, cooking, cookingRecipe, timers, exactAlarms,
    // Actions
    notify, undo, patchList, patchItem, removeEntity, toggleDarkMode, openSheet, closeSheet,
    openList, closeList: () => setCurrentListId(null), startNewList, addList, submitListName, deleteList, completeList, repeatList, saveAsTemplate, sendAsText,
    openProductSheet, saveProduct, addQuick, quickAdd, deleteProduct, clearPurchased, toggleSortMode, reorder, addProductsTo, addToSomeList,
    openRecipe, saveRecipe, editStep, addStep, removeStep, moveStep, pickRecipePhoto, removeRecipePhoto,
    startCooking, goToStep, stopCooking, startStepTimer, allowExactAlarms,
    openStore, saveStore, openCategories, addCategory, setReminder,
    lang, changeLanguage,
    openFamily, joinFamily, leaveFamily, togglePersonal,
    openAccount, run, submitAccount, openPasswordSheet, openDeleteAccount, startVerification, signOut, openShare,
  };
}
