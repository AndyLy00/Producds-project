import {
  ArchiveIcon,
  ArrowLeftIcon,
  BackpackIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  Cross2Icon,
  GearIcon,
  HeartIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  Pencil1Icon,
  PlusIcon,
  StarFilledIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { BottomSheet, KeyboardInput, MobileScroll, useKeyboard, useKeyboardInsets } from "./mobile";
import { loadShoppingData, saveShoppingData, type ShoppingData, type ShoppingItem, type ShoppingList } from "./shopping-data";

const categories = ["Овощи и фрукты", "Мясо и рыба", "Молочные продукты", "Бакалея", "Напитки", "Для дома", "Сладости и снеки"];
const units = ["шт.", "кг", "г", "л", "мл", "уп."];
const categoryOrder = new Map(categories.map((category, index) => [category, index]));
const productImages: Record<string, string> = {
  молоко: "/assets/app/items/milk.png",
  хлеб: "/assets/app/items/bread.png",
  яблоки: "/assets/app/items/apples.png",
  яйца: "/assets/app/items/eggs.png",
  помидоры: "/assets/app/items/tomatoes.png",
  сыр: "/assets/app/items/cheese.png",
  кофе: "/assets/app/items/coffee.png",
};

function createId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function guessCategory(name: string) {
  const value = name.toLocaleLowerCase("ru");
  if (/яблок|помидор|томат|лук|огур|картоф|морков|зелень|капуст|банан|апельс|перец|лимон|груш/.test(value)) return categories[0];
  if (/кур|мяс|говяд|свин|рыб|фарш|колбас|сосиск/.test(value)) return categories[1];
  if (/молок|сыр|яйц|сметан|йогурт|кефир|творог|масло слив/.test(value)) return categories[2];
  if (/вода|сок|чай|кофе|напит|лимонад/.test(value)) return categories[4];
  if (/шоколад|печень|снек|конфет|чипс|слад/.test(value)) return categories[6];
  if (/моющ|губк|пакет|бумаг|средств|мыло|шампун/.test(value)) return categories[5];
  return categories[3];
}

function sortItems(items: ShoppingItem[]) {
  return [...items].sort((a, b) => {
    if (a.purchased !== b.purchased) return Number(a.purchased) - Number(b.purchased);
    return (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99) || a.name.localeCompare(b.name, "ru");
  });
}

function progress(list: ShoppingList) {
  const bought = list.items.filter((item) => item.purchased).length;
  return { bought, total: list.items.length, percent: list.items.length ? (bought / list.items.length) * 100 : 0 };
}

function makeItem(name: string, quantity: string, unit: string, category: string, note = ""): ShoppingItem {
  return { id: createId(), name: name.trim(), quantity: quantity || "1", unit, category, note, purchased: false, favorite: false };
}

function initialForm() {
  return { name: "", quantity: "1", unit: "шт.", category: categories[3], note: "" };
}

type SheetMode = "product" | "list" | null;
type Tab = "lists" | "favorites" | "history" | "settings";

export default function Prototype() {
  const [data, setData] = useState<ShoppingData>({ lists: [], history: [], darkMode: false });
  const [ready, setReady] = useState(false);
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("lists");
  const [query, setQuery] = useState("");
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm());
  const [listName, setListName] = useState("");
  const [quickName, setQuickName] = useState("");
  const [showPurchased, setShowPurchased] = useState(true);
  const [toast, setToast] = useState("");
  const keyboard = useKeyboard();
  const { bottomInset } = useKeyboardInsets();

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
    document.documentElement.classList.toggle("smart-shopping-dark", data.darkMode);
    return () => document.documentElement.classList.remove("smart-shopping-dark");
  }, [data.darkMode]);

  useEffect(() => {
    if (sheetMode !== null) return;
    const frame = window.requestAnimationFrame(() => keyboard.hide());
    return () => window.cancelAnimationFrame(frame);
  }, [sheetMode]);

  // System back button in the Android app (dispatched from src/native/main.tsx).
  // Leaving the event unhandled on the root screen lets the app close.
  useEffect(() => {
    const onBack = (event: Event) => {
      if (sheetMode !== null) setSheetMode(null);
      else if (currentListId !== null) setCurrentListId(null);
      else if (tab !== "lists") setTab("lists");
      else return;
      event.preventDefault();
    };
    window.addEventListener("app:back", onBack);
    return () => window.removeEventListener("app:back", onBack);
  }, [sheetMode, currentListId, tab]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentList = data.lists.find((list) => list.id === currentListId) ?? null;
  const activeItems = useMemo(() => {
    if (!currentList) return [];
    return sortItems(currentList.items.filter((item) => !item.purchased));
  }, [currentList]);
  const purchasedItems = useMemo(() => currentList ? sortItems(currentList.items.filter((item) => item.purchased)) : [], [currentList]);
  const filteredItems = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("ru");
    return activeItems.filter((item) => !value || `${item.name} ${item.category} ${item.note}`.toLocaleLowerCase("ru").includes(value));
  }, [activeItems, query]);
  const allFavorites = data.lists.flatMap((list) => list.items.filter((item) => item.favorite).map((item) => ({ ...item, listName: list.name, listId: list.id })));

  function updateList(listId: string, updater: (list: ShoppingList) => ShoppingList) {
    setData((previous) => ({
      ...previous,
      lists: previous.lists.map((list) => list.id === listId ? { ...updater(list), updatedAt: Date.now() } : list),
    }));
  }

  function openProductSheet(item?: ShoppingItem) {
    setEditingItem(item ?? null);
    setForm(item ? { name: item.name, quantity: item.quantity, unit: item.unit, category: item.category, note: item.note } : initialForm());
    setSheetMode("product");
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentList || !form.name.trim()) return;
    if (editingItem) {
      updateList(currentList.id, (list) => ({ ...list, items: list.items.map((item) => item.id === editingItem.id ? { ...item, ...form, name: form.name.trim() } : item) }));
      setToast("Изменения сохранены");
    } else {
      const item = makeItem(form.name, form.quantity, form.unit, form.category, form.note);
      updateList(currentList.id, (list) => ({ ...list, items: [...list.items, item] }));
      setToast("Добавлено в список");
    }
    setSheetMode(null);
    keyboard.hide();
  }

  function quickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentList || !quickName.trim()) return;
    const item = makeItem(quickName, "1", "шт.", guessCategory(quickName));
    updateList(currentList.id, (list) => ({ ...list, items: [...list.items, item] }));
    setQuickName("");
    keyboard.hide();
    setToast("Добавлено в список");
  }

  function togglePurchased(listId: string, itemId: string) {
    updateList(listId, (list) => ({ ...list, items: list.items.map((item) => item.id === itemId ? { ...item, purchased: !item.purchased } : item) }));
  }

  function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listName.trim()) return;
    const list: ShoppingList = { id: createId(), name: listName.trim(), createdAt: Date.now(), updatedAt: Date.now(), items: [] };
    setData((previous) => ({ ...previous, lists: [list, ...previous.lists] }));
    setListName("");
    setSheetMode(null);
    setCurrentListId(list.id);
    setTab("lists");
    keyboard.hide();
  }

  function startNewList() {
    setListName("");
    setEditingListId(null);
    setSheetMode("list");
  }

  function archiveList(list: ShoppingList) {
    setData((previous) => ({ ...previous, lists: previous.lists.filter((entry) => entry.id !== list.id), history: [{ ...list, completedAt: Date.now() }, ...previous.history] }));
    setCurrentListId(null);
    setToast("Список перемещён в историю");
  }

  function deleteProduct() {
    if (!currentList || !editingItem) return;
    updateList(currentList.id, (list) => ({ ...list, items: list.items.filter((item) => item.id !== editingItem.id) }));
    setSheetMode(null);
    setToast("Продукт удалён");
  }

  function clearPurchased() {
    if (!currentList || purchasedItems.length === 0) return;
    updateList(currentList.id, (list) => ({ ...list, items: list.items.filter((item) => !item.purchased) }));
    setToast("Купленные продукты очищены");
  }

  function toggleFavorite(listId: string, itemId: string) {
    updateList(listId, (list) => ({ ...list, items: list.items.map((item) => item.id === itemId ? { ...item, favorite: !item.favorite } : item) }));
  }

  function addFavoriteToList(item: ShoppingItem & { listName: string; listId: string }) {
    const targetId = currentListId ?? data.lists[0]?.id ?? item.listId;
    const { listName: _listName, listId: _listId, ...sourceItem } = item;
    updateList(targetId, (list) => {
      const found = list.items.find((entry) => entry.name.toLocaleLowerCase("ru") === item.name.toLocaleLowerCase("ru") && !entry.purchased);
      return { ...list, items: found ? list.items.map((entry) => entry.id === found.id ? { ...entry, quantity: String(Number(entry.quantity) + 1 || 2) } : entry) : [...list.items, { ...sourceItem, id: createId(), purchased: false }] };
    });
    setToast("Добавлено в список");
  }

  const screenTitle = currentList?.name ?? "Мои списки";

  return (
    <div className={`shopping-app ${data.darkMode ? "theme-dark" : ""}`} style={{ "--mobile-safe-area-height": `${bottomInset}px` } as CSSProperties}>
      {currentList ? (
        <>
          <MobileScroll className="app-screen">
            <main className="list-screen screen-content">
              <header className="brand-header">
                <button className="brand-home" aria-label="Назад к спискам" onClick={() => { setCurrentListId(null); setTab("lists"); }}>
                  <span className="brand-mark" aria-hidden="true"><BackpackIcon /></span>
                  <span>Корзина</span>
                </button>
                <button className="icon-button header-action" aria-label="Настройки" onClick={() => { setCurrentListId(null); setTab("settings"); }}><GearIcon /></button>
              </header>

              <div className="list-heading-row">
                <button className="back-button" aria-label="К спискам" onClick={() => { setCurrentListId(null); setTab("lists"); }}><ArrowLeftIcon /></button>
                <div className="list-heading-copy">
                  <p className="eyebrow">СПИСОК ПОКУПОК</p>
                  <h1>{screenTitle}</h1>
                </div>
                <button className="icon-button" aria-label="Изменить название списка" onClick={() => { setListName(currentList.name); setEditingListId(currentList.id); setSheetMode("list"); }}><Pencil1Icon /></button>
              </div>

              <section className="progress-block" aria-label="Прогресс покупок">
                <div className="progress-copy"><span>{progress(currentList).bought} из {progress(currentList).total} куплено</span><span>{Math.round(progress(currentList).percent)}%</span></div>
                <div className="progress-track"><span style={{ width: `${progress(currentList).percent}%` }} /></div>
              </section>

              <div className="list-tools">
                <div className="search-field"><MagnifyingGlassIcon /><KeyboardInput aria-label="Поиск продуктов" placeholder="Найти продукт" value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => keyboard.hide()} /></div>
                <button className="sort-chip" onClick={() => setToast("Продукты сгруппированы по категориям")}>По категориям</button>
              </div>

              <section className="items-section" aria-label="Осталось купить">
                {filteredItems.length ? (
                  <div className="item-list">
                    {filteredItems.map((item) => (
                      <ProductRow key={item.id} item={item} onToggle={() => togglePurchased(currentList.id, item.id)} onEdit={() => openProductSheet(item)} onFavorite={() => toggleFavorite(currentList.id, item.id)} />
                    ))}
                  </div>
                ) : <div className="empty-search">{query ? "Ничего не найдено" : "Все покупки сделаны. Добавьте что-нибудь ещё."}</div>}
              </section>

              {purchasedItems.length > 0 && (
                <section className="purchased-section">
                  <button className="purchased-toggle" onClick={() => setShowPurchased((value) => !value)}>
                    <span><CheckIcon /> Купленные <b>{purchasedItems.length}</b></span><ChevronDownIcon className={showPurchased ? "chevron-open" : ""} />
                  </button>
                  {showPurchased && <div className="item-list purchased-list">{purchasedItems.map((item) => <ProductRow key={item.id} item={item} onToggle={() => togglePurchased(currentList.id, item.id)} onEdit={() => openProductSheet(item)} onFavorite={() => toggleFavorite(currentList.id, item.id)} />)}</div>}
                  <button className="clear-button" onClick={clearPurchased}><TrashIcon /> Очистить купленное</button>
                </section>
              )}
              <div className="bottom-spacer" />
            </main>
          </MobileScroll>
          <form className="quick-add-bar" onSubmit={quickAdd}>
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
                <div className="section-title-row"><h2>Мои списки <span>{data.lists.length}</span></h2><button className="text-action" onClick={startNewList}><PlusIcon /> Новый</button></div>
                {data.lists.length === 0 ? <EmptyState title="Пока нет списков" text="Создайте список и добавьте туда первые покупки." action={startNewList} /> : <div className="shopping-lists">{data.lists.map((list, index) => <button className={`list-card list-card-${index % 3}`} key={list.id} onClick={() => { setCurrentListId(list.id); setQuery(""); }}>
                  <div className="list-card-top"><span className="list-symbol">{index === 0 ? <ArchiveIcon /> : index === 1 ? <BackpackIcon /> : <CalendarIcon />}</span><span className="list-card-progress">{progress(list).bought}/{progress(list).total}</span></div>
                  <strong>{list.name}</strong><span className="list-card-meta">{list.items.length ? `${list.items.length - progress(list).bought} осталось купить` : "Пока пусто"}</span>
                  <div className="mini-progress"><span style={{ width: `${progress(list).percent}%` }} /></div>
                  <ChevronRightIcon className="list-card-arrow" />
                </button>)}</div>}
                <button className="create-list-button" onClick={startNewList}><span className="create-list-icon"><PlusIcon /></span><span><b>Создать новый список</b><small>Для магазина, дома или рецепта</small></span><ChevronRightIcon /></button>
                {data.lists.length > 0 && <section className="home-tip"><span className="tip-mark"><StarFilledIcon /></span><p>Отмечайте продукты в магазине — список сам покажет, что ещё осталось.</p></section>}
              </>}

              {tab === "favorites" && <>
                <section className="welcome-block compact-welcome"><p className="eyebrow">БЫСТРЫЙ ДОСТУП</p><h1>Избранное</h1><p className="welcome-subtitle">Часто покупаемые продукты.</p></section>
                {allFavorites.length ? <div className="favorite-list">{allFavorites.map((item) => <div className="favorite-row" key={`${item.listId}-${item.id}`}><button className="favorite-row-main" onClick={() => { setCurrentListId(item.listId); setTab("lists"); }}><span className="favorite-star"><StarFilledIcon /></span><span><b>{item.name}</b><small>{item.listName} · {item.quantity} {item.unit}</small></span></button><button className="favorite-add" aria-label={`Добавить ${item.name} в список`} onClick={() => addFavoriteToList(item)}><PlusIcon /></button></div>)}</div> : <EmptyState title="Здесь будут ваши любимые продукты" text="Нажмите на звёздочку рядом с продуктом, чтобы сохранить его." />}
              </>}

              {tab === "history" && <>
                <section className="welcome-block compact-welcome"><p className="eyebrow">ЗАВЕРШЁННЫЕ ПОКУПКИ</p><h1>История</h1><p className="welcome-subtitle">Списки, которые вы завершили.</p></section>
                {data.history.length ? <div className="history-list">{data.history.map((list) => <button key={list.id} className="history-row" onClick={() => { const copy: ShoppingList = { ...list, id: createId(), name: `${list.name} · копия`, items: list.items.map((item) => ({ ...item, id: createId(), purchased: false })) }; setData((prev) => ({ ...prev, lists: [copy, ...prev.lists] })); setCurrentListId(copy.id); setTab("lists"); }}><span className="history-icon"><ClockIcon /></span><span><b>{list.name}</b><small>{list.items.length} продуктов · {new Date(list.completedAt ?? list.updatedAt).toLocaleDateString("ru-RU")}</small></span><span className="history-repeat">Повторить</span></button>)}</div> : <EmptyState title="История пока пуста" text="Завершите список покупок, чтобы он появился здесь." />}
              </>}

              {tab === "settings" && <>
                <section className="welcome-block compact-welcome"><p className="eyebrow">ПЕРСОНАЛИЗАЦИЯ</p><h1>Настройки</h1><p className="welcome-subtitle">Подстройте приложение под себя.</p></section>
                <section className="settings-group"><p className="settings-label">ВНЕШНИЙ ВИД</p><button className="setting-row" onClick={() => setData((prev) => ({ ...prev, darkMode: !prev.darkMode }))}><span className="setting-icon">{data.darkMode ? <MoonIcon /> : <SunIcon />}</span><span><b>{data.darkMode ? "Тёмная тема" : "Светлая тема"}</b><small>Нажмите, чтобы переключить оформление</small></span><span className={`theme-switch ${data.darkMode ? "switch-on" : ""}`}><i /></span></button></section>
                <section className="settings-group"><p className="settings-label">ДАННЫЕ</p><div className="setting-row static-row"><span className="setting-icon"><HomeIcon /></span><span><b>Хранение на устройстве</b><small>Списки доступны без интернета</small></span><span className="local-badge">Локально</span></div></section>
                <div className="settings-note">Ваши покупки сохраняются на этом устройстве. Синхронизацию между устройствами можно добавить позже.</div>
              </>}
              <div className="bottom-spacer" />
            </main>
          </MobileScroll>
          <nav className="bottom-nav" aria-label="Основная навигация">
            <NavButton active={tab === "lists"} icon={<HomeIcon />} label="Списки" onClick={() => setTab("lists")} />
            <NavButton active={tab === "favorites"} icon={<StarIcon />} label="Избранное" onClick={() => setTab("favorites")} />
            <NavButton active={tab === "history"} icon={<ClockIcon />} label="История" onClick={() => setTab("history")} />
            <NavButton active={tab === "settings"} icon={<GearIcon />} label="Настройки" onClick={() => setTab("settings")} />
          </nav>
        </>
      )}

      <BottomSheet open={sheetMode !== null} onOpenChange={(open) => { if (!open) { setSheetMode(null); keyboard.hide(); } }} title={sheetMode === "list" ? (editingListId ? "Изменить список" : "Новый список") : editingItem ? "Изменить продукт" : "Добавить продукт"} description={sheetMode === "list" ? "Дайте списку короткое название." : "Количество, категория и заметка — по желанию."} snap={0.84}>
        {sheetMode === "product" ? (
          <form className="sheet-form" onSubmit={saveProduct}>
            <button type="button" className="sheet-close" aria-label="Закрыть форму" onClick={() => { keyboard.hide(); setSheetMode(null); }}><Cross2Icon /></button>
            <label className="form-label">Название<KeyboardInput placeholder="Например, куриное филе" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value, category: prev.category === categories[3] ? guessCategory(event.target.value) : prev.category }))} onBlur={() => keyboard.hide()} /></label>
            <div className="form-grid"><label className="form-label">Количество<KeyboardInput inputMode="decimal" value={form.quantity} onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))} onBlur={() => keyboard.hide()} /></label><label className="form-label">Единица<select value={form.unit} onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label></div>
            <label className="form-label">Категория<select value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="form-label">Примечание <span>Необязательно</span><KeyboardInput placeholder="Например, для запекания" value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} onBlur={() => keyboard.hide()} /></label>
            <div className="sheet-actions"><button className="primary-button" disabled={!form.name.trim()}>{editingItem ? "Сохранить" : "Добавить продукт"}</button>{editingItem && <button type="button" className="destructive-button" onClick={deleteProduct}><TrashIcon /> Удалить продукт</button>}</div>
          </form>
        ) : (
          <form className="sheet-form" onSubmit={(event) => {
            event.preventDefault();
            if (!listName.trim()) return;
            if (editingListId) { updateList(editingListId, (list) => ({ ...list, name: listName.trim() })); setToast("Название списка изменено"); }
            else createList(event);
            setSheetMode(null); keyboard.hide();
          }}>
            <button type="button" className="sheet-close" aria-label="Закрыть форму" onClick={() => { keyboard.hide(); setSheetMode(null); }}><Cross2Icon /></button>
            <label className="form-label">Название списка<KeyboardInput placeholder="Например, покупки на выходные" value={listName} onChange={(event) => setListName(event.target.value)} onBlur={() => keyboard.hide()} /></label>
            <button className="primary-button" disabled={!listName.trim()}>{editingListId ? "Сохранить" : "Создать список"}</button>
            {editingListId && <button type="button" className="destructive-button" onClick={() => { const list = data.lists.find((entry) => entry.id === editingListId); if (list) archiveList(list); setSheetMode(null); }}><TrashIcon /> Завершить и переместить в историю</button>}
          </form>
        )}
      </BottomSheet>
      {toast && <div className="toast" role="status">{toast}<button onClick={() => setToast("")} aria-label="Закрыть"><Cross2Icon /></button></div>}
    </div>
  );
}

function ProductRow({ item, onToggle, onEdit, onFavorite }: { item: ShoppingItem; onToggle: () => void; onEdit: () => void; onFavorite: () => void }) {
  const image = productImages[item.name.toLocaleLowerCase("ru")];
  return <div className={`product-row ${item.purchased ? "product-row-done" : ""}`}>
    <button className={`check-button ${item.purchased ? "checked" : ""}`} onClick={onToggle} aria-label={item.purchased ? `Вернуть ${item.name} в список` : `Отметить ${item.name} купленным`}>{item.purchased && <CheckIcon />}</button>
    {image ? <img className="product-art" src={image} alt="" /> : <span className={`product-art product-art-placeholder cat-${categories.indexOf(item.category)}`} aria-hidden="true">{item.name.slice(0, 1).toLocaleUpperCase("ru")}</span>}
    <button className="product-main" onClick={onEdit}><span className="product-name">{item.name}</span>{item.note && <small className="product-note">{item.note}</small>}</button>
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
