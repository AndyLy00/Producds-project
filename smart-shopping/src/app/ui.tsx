// Small building blocks shared by the screens and sheets.
import { BellIcon, CheckIcon, Cross2Icon, DragHandleDots2Icon, HeartIcon, MixIcon, PersonIcon, PlusIcon, StarFilledIcon, StarIcon } from "@radix-ui/react-icons";
import type { ReactNode } from "react";
import { formatReminder, type ShoppingItem, type ShoppingList } from "../model";
import type { DragHandle } from "../sortable";
import type { Sheet, SheetOf } from "./types";
import type { ShoppingApp } from "./useShoppingApp";

// Props of the sheet that renders one kind of Sheet.
export type SheetProps<K extends Sheet["kind"]> = { app: ShoppingApp; sheet: SheetOf<K> };

const productImages: Record<string, string> = {
  молоко: "/assets/app/items/milk.png",
  хлеб: "/assets/app/items/bread.png",
  яблоки: "/assets/app/items/apples.png",
  яйца: "/assets/app/items/eggs.png",
  помидоры: "/assets/app/items/tomatoes.png",
  сыр: "/assets/app/items/cheese.png",
  кофе: "/assets/app/items/coffee.png",
};

export function ProductRow({ item, handle, onToggle, onEdit, onFavorite }: { item: ShoppingItem; handle?: DragHandle; onToggle: () => void; onEdit: () => void; onFavorite: () => void }) {
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

export function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? "nav-active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><span>{icon}</span><small>{label}</small></button>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><HeartIcon /></span><h3>{title}</h3><p>{text}</p>{action && <button className="primary-button" onClick={action}><PlusIcon /> Создать список</button>}</div>;
}

// Shared list members, store and reminder of a list.
export function ListBadges({ app, list }: { app: ShoppingApp; list: ShoppingList }) {
  const sharing = app.data.sharing[list.id];
  const store = app.storeName(list);
  if (!sharing && !store && !list.remindAt) return null;
  return (
    <span className="list-badges">
      {sharing && <span className="badge"><PersonIcon /> {sharing.members}</span>}
      {store && <span className="badge"><MixIcon /> {store}</span>}
      {list.remindAt && <span className={`badge ${list.remindAt < Date.now() ? "badge-alert" : ""}`}><BellIcon /> {formatReminder(list.remindAt)}</span>}
    </span>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <label className="form-label">{label}{children}</label>;
}

export function SheetClose({ app }: { app: ShoppingApp }) {
  return <button type="button" className="sheet-close" aria-label="Закрыть" onClick={app.closeSheet}><Cross2Icon /></button>;
}

export function FormError({ app }: { app: ShoppingApp }) {
  return app.formError ? <p className="form-error" role="alert">{app.formError}</p> : null;
}
