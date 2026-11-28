// Small building blocks shared by the screens and sheets.
import { BackpackIcon, BellIcon, CheckIcon, Cross2Icon, DragHandleDots2Icon, HeartIcon, MixIcon, PersonIcon, PlusIcon, StarFilledIcon, StarIcon, UpdateIcon } from "@radix-ui/react-icons";
import { memo, useState, type PointerEvent, type ReactNode } from "react";
import { currentShopper, formatReminder, nextReminder, personName, productImage, type ShoppingItem, type ShoppingList } from "../model";
import { usePhoto } from "../photos";
import { formatLei } from "./usePrices";
import type { DragHandle } from "../sortable";
import type { Sheet, SheetOf } from "./types";
import type { ShoppingApp } from "./useShoppingApp";
import { t } from "../i18n";

// Props of the sheet that renders one kind of Sheet.
export type SheetProps<K extends Sheet["kind"]> = { app: ShoppingApp; sheet: SheetOf<K> };

// `cost`: what the item would cost at Linella, in bani (src/app/usePrices.ts).
// `who`: who of the family added or bought the item, when it is worth saying (src/app/ListScreen.tsx).
// Memoized: a long list does not redraw every row on each keystroke elsewhere on the screen. The
// handlers get the item back and must stay the same between renders; `lang` redraws the row's
// texts when the language changes.
export const ProductRow = memo(function ProductRow({ item, handle, onToggle, onEdit, onFavorite, cost, who }: { item: ShoppingItem; handle?: DragHandle; onToggle: (item: ShoppingItem) => void; onEdit: (item: ShoppingItem) => void; onFavorite: (item: ShoppingItem) => void; cost?: number; who?: string; lang: string }) {
  const image = productImage(item.name);
  return <div className={`product-row ${item.purchased ? "product-row-done" : ""}`}>
    {handle && <span className="drag-handle" aria-label={t("Перетащить {name}", { name: item.name })} {...handle}><DragHandleDots2Icon /></span>}
    <button className={`check-button ${item.purchased ? "checked" : ""}`} onClick={() => onToggle(item)} aria-label={item.purchased ? t("Вернуть {name} в список", { name: item.name }) : t("Отметить {name} купленным", { name: item.name })}>{item.purchased && <CheckIcon />}</button>
    {image ? <img className="product-art" src={image} alt="" /> : <span className="product-art product-art-placeholder" aria-hidden="true">{item.name.slice(0, 1).toLocaleUpperCase("ru")}</span>}
    <button className="product-main" onClick={() => onEdit(item)}><span className="product-name">{item.name}</span><small className="product-note">{[t(item.category), item.note].filter(Boolean).join(" · ")}</small>{who && <small className="product-who">{who}</small>}</button>
    <span className="product-quantity">{item.quantity} {t(item.unit)}{cost !== undefined && <small className="product-price">≈ {formatLei(cost)}</small>}</span>
    <button className={`favorite-button ${item.favorite ? "favorite-active" : ""}`} onClick={() => onFavorite(item)} aria-label={item.favorite ? t("Убрать из избранного") : t("В избранное")}>{item.favorite ? <StarFilledIcon /> : <StarIcon />}</button>
  </div>;
});

export function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? "nav-active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><span>{icon}</span><small>{label}</small></button>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><HeartIcon /></span><h3>{title}</h3><p>{text}</p>{action && <button className="primary-button" onClick={action}><PlusIcon /> {t("Создать список")}</button>}</div>;
}

// Shared list members, store and reminder of a list.
export function ListBadges({ app, list }: { app: ShoppingApp; list: ShoppingList }) {
  const sharing = app.data.sharing[list.id];
  const store = app.storeName(list);
  // A repeating reminder shows when it comes next; a past one-time reminder stays, marked.
  const next = nextReminder(list);
  const shown = next ?? (list.remindAt && !list.completedAt ? list.remindAt : undefined);
  // Who goes to the store; only while the list is still to be bought.
  const shopper = currentShopper(list, app.familyEmails)?.email;
  const mine = shopper !== undefined && shopper === app.cloud.email?.toLowerCase();
  if (!sharing && !store && !shown && !shopper) return null;
  return (
    <span className="list-badges">
      {shopper && <span className={`badge ${mine ? "badge-shopper" : ""}`}><BackpackIcon /> {mine ? t("Идёте вы") : t("Идёт: {name}", { name: personName(shopper) })}</span>}
      {sharing && <span className="badge"><PersonIcon /> {sharing.members}</span>}
      {store && <span className="badge"><MixIcon /> {store}</span>}
      {shown && <span className={`badge ${shown < Date.now() ? "badge-alert" : ""}`}>{list.repeat ? <UpdateIcon /> : <BellIcon />} {formatReminder(shown)}</span>}
    </span>
  );
}

// A recipe photo, or the fallback when there is none (or it cannot be loaded).
export function RecipePhoto({ id, className, fallback = null }: { id?: string; className: string; fallback?: ReactNode }) {
  const source = usePhoto(id);
  const [failed, setFailed] = useState<string | null>(null);
  if (!source || failed === source) return <>{fallback}</>;
  return <img className={className} src={source} alt="" onError={() => setFailed(source)} />;
}

// While a field has focus the sheet is taller (src/native/index.tsx); a tap that took the focus
// away would shrink it and move the tapped button away before the click lands. The buttons
// in a sheet keep the focus instead; closing the sheet hides the keyboard anyway.
export const keepFocus = (event: PointerEvent<HTMLElement>) => {
  if ((event.target as HTMLElement).closest("button")) event.preventDefault();
};

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <label className="form-label">{label}{children}</label>;
}

export function SheetClose({ app }: { app: ShoppingApp }) {
  return <button type="button" className="sheet-close" aria-label={t("Закрыть")} onClick={app.closeSheet}><Cross2Icon /></button>;
}

export function FormError({ app }: { app: ShoppingApp }) {
  return app.formError ? <p className="form-error" role="alert">{app.formError}</p> : null;
}
