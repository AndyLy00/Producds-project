// One open shopping list: products to buy, bought products and the quick-add bar.
import { ArchiveIcon, ArrowLeftIcon, BackpackIcon, CheckIcon, ChevronDownIcon, DotsHorizontalIcon, MagnifyingGlassIcon, Pencil1Icon, PlusIcon, Share1Icon, TrashIcon } from "@radix-ui/react-icons";
import { KeyboardInput, MobileScroll } from "../mobile";
import { alive, progress, sortItems, type ShoppingItem, type ShoppingList } from "../model";
import { Sortable, type DragHandle } from "../sortable";
import { ListBadges, ProductRow } from "./ui";
import type { ShoppingApp } from "./useShoppingApp";
import { t } from "../i18n";

export function ListScreen({ app, list }: { app: ShoppingApp; list: ShoppingList }) {
  const { data, query, keyboard } = app;
  const items = alive(list.items);
  const activeItems = sortItems(items.filter((item) => !item.purchased), list, data);
  const purchasedItems = sortItems(items.filter((item) => item.purchased), list, data);
  const search = query.trim().toLocaleLowerCase();
  const filteredItems = activeItems.filter((item) => !search || `${item.name} ${item.category} ${t(item.category)} ${item.note}`.toLocaleLowerCase().includes(search));
  const manual = list.sortMode === "manual" && !search;
  const { bought, total, left, percent } = progress(list);

  const productRow = (item: ShoppingItem, handle?: DragHandle) => (
    <ProductRow
      item={item}
      handle={handle}
      onToggle={() => app.patchItem(list.id, item.id, { purchased: !item.purchased })}
      onEdit={() => app.openProductSheet(item)}
      onFavorite={() => app.patchItem(list.id, item.id, { favorite: !item.favorite })}
    />
  );

  return (
    <>
      <MobileScroll className="app-screen">
        <main className="list-screen screen-content">
          <header className="brand-header">
            <button className="brand-home" aria-label={t("Назад к спискам")} onClick={app.closeList}>
              <span className="brand-mark" aria-hidden="true"><BackpackIcon /></span>
              <span>{t("Корзина")}</span>
            </button>
            <button className="icon-button header-action" aria-label={t("Действия со списком")} onClick={() => app.openSheet({ kind: "actions", listId: list.id })}><DotsHorizontalIcon /></button>
          </header>

          <div className="list-heading-row">
            <button className="back-button" aria-label={t("К спискам")} onClick={app.closeList}><ArrowLeftIcon /></button>
            <div className="list-heading-copy">
              <p className="eyebrow">{data.sharing[list.id]?.family ? t("СЕМЕЙНЫЙ СПИСОК") : data.sharing[list.id] ? t("СОВМЕСТНЫЙ СПИСОК") : t("СПИСОК ПОКУПОК")}</p>
              <h1>{list.name}</h1>
            </div>
            <button className="icon-button" aria-label={t("Отправить список")} onClick={() => void app.sendAsText(list)}><Share1Icon /></button>
          </div>
          <ListBadges app={app} list={list} />

          <section className="progress-block" aria-label={t("Прогресс покупок")}>
            <div className="progress-copy"><span>{t("{bought} из {total} куплено", { bought, total })}</span><span>{Math.round(percent)}%</span></div>
            <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
          </section>

          <div className="list-tools">
            <div className="search-field"><MagnifyingGlassIcon /><KeyboardInput aria-label={t("Поиск продуктов")} placeholder={t("Найти продукт")} value={query} onChange={(event) => app.setQuery(event.target.value)} onBlur={() => keyboard.hide()} /></div>
            <button className={`sort-chip ${list.sortMode === "manual" ? "sort-chip-active" : ""}`} onClick={app.toggleSortMode}>{list.sortMode === "manual" ? t("Свой порядок") : app.storeName(list) ?? t("По категориям")}</button>
          </div>

          <section className="items-section" aria-label={t("Осталось купить")}>
            {filteredItems.length ? (
              manual
                ? <Sortable className="item-list" items={filteredItems} getKey={(item) => item.id} onReorder={(from, to) => app.reorder(filteredItems, from, to)} render={(item, handle) => productRow(item, handle)} />
                : <div className="item-list">{filteredItems.map((item) => <div key={item.id}>{productRow(item)}</div>)}</div>
            ) : <div className="empty-search">{query ? t("Ничего не найдено") : t("Все покупки сделаны. Добавьте что-нибудь ещё.")}</div>}
          </section>

          {purchasedItems.length > 0 && (
            <section className="purchased-section">
              <button className="purchased-toggle" onClick={() => app.setShowPurchased((value) => !value)}>
                <span><CheckIcon /> {t("Купленные")} <b>{purchasedItems.length}</b></span><ChevronDownIcon className={app.showPurchased ? "chevron-open" : ""} />
              </button>
              {app.showPurchased && <div className="item-list purchased-list">{purchasedItems.map((item) => <div key={item.id}>{productRow(item)}</div>)}</div>}
              <button className="clear-button" onClick={app.clearPurchased}><TrashIcon /> {t("Очистить купленное")}</button>
            </section>
          )}
          {total > 0 && left === 0 && <button className="secondary-button complete-button" onClick={() => app.completeList(list)}><ArchiveIcon /> {t("Завершить список")}</button>}
          <div className="bottom-spacer" />
        </main>
      </MobileScroll>
      <form className="quick-add-bar" onSubmit={app.quickAdd}>
        {app.hints.length > 0 && (
          <div className="suggestion-row" aria-label={t("Подсказки")}>
            {app.hints.map((product) => <button type="button" key={product.name} className="suggestion-chip" onPointerDown={(event) => event.preventDefault()} onClick={() => app.addQuick(product)}><PlusIcon /> {product.name} <small>{product.quantity} {t(product.unit)}</small></button>)}
          </div>
        )}
        <KeyboardInput aria-label={t("Добавить продукт")} placeholder={t("Добавить продукт")} value={app.quickName} onChange={(event) => app.setQuickName(event.target.value)} onBlur={() => keyboard.hide()} />
        <button className="quick-add-button" aria-label={t("Добавить продукт")}><PlusIcon /></button>
        <button type="button" className="quick-add-more" aria-label={t("Подробно добавить продукт")} onClick={() => app.openProductSheet()}><Pencil1Icon /></button>
      </form>
    </>
  );
}
