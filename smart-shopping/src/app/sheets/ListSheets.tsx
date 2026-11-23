// Sheets about one list and its products.
import {
  ArchiveIcon,
  BellIcon,
  BookmarkIcon,
  ChevronRightIcon,
  CopyIcon,
  Cross2Icon,
  EnvelopeClosedIcon,
  ExitIcon,
  HomeIcon,
  Link2Icon,
  LockClosedIcon,
  MixIcon,
  Pencil1Icon,
  PersonIcon,
  PlusIcon,
  Share1Icon,
  TrashIcon,
} from "@radix-ui/react-icons";
import type { ReactNode } from "react";
import { KeyboardInput } from "../../mobile";
import { shareText } from "../../device";
import { addProducts, alive, formatReminder, guessCategory, newList, progress, units, type Template } from "../../model";
import { at, nextWeekday, toLocalInput } from "../types";
import { Field, FormError, SheetClose, type SheetProps as Props } from "../ui";
import { formatLei, usePrices } from "../usePrices";
import { t } from "../../i18n";

export function ProductSheet({ app, sheet }: Props<"product">) {
  const { form, setForm, keyboard } = app;
  const shopPrice = usePrices(form.name.trim() ? [form.name] : []).prices[form.name.trim()];
  return (
    <form className="sheet-form" onSubmit={app.saveProduct}>
      <SheetClose app={app} />
      <Field label={t("Название")}><KeyboardInput placeholder={t("Например, куриное филе")} value={form.name} onChange={(event) => { const name = event.target.value; setForm((previous) => ({ ...previous, name, category: previous.category && previous.category !== guessCategory(previous.name) ? previous.category : guessCategory(name) })); }} onBlur={() => keyboard.hide()} /></Field>
      <div className="form-grid">
        <Field label={t("Количество")}><KeyboardInput inputMode="decimal" value={form.quantity} onChange={(event) => { const quantity = event.target.value; setForm((previous) => ({ ...previous, quantity })); }} onBlur={() => keyboard.hide()} /></Field>
        <Field label={t("Единица")}><select value={form.unit} onChange={(event) => { const unit = event.target.value; setForm((previous) => ({ ...previous, unit })); }}>{units.map((unit) => <option key={unit} value={unit}>{t(unit)}</option>)}</select></Field>
      </div>
      <Field label={<>{t("Категория")} <button type="button" className="inline-link" onClick={app.openCategories}>{t("Свои категории")}</button></>}><select value={form.category || guessCategory(form.name)} onChange={(event) => { const category = event.target.value; setForm((previous) => ({ ...previous, category })); }}>{app.categories.map((category) => <option key={category} value={category}>{t(category)}</option>)}</select></Field>
      <Field label={<>{t("Примечание")} <span>{t("Необязательно")}</span></>}><KeyboardInput placeholder={t("Например, для запекания")} value={form.note} onChange={(event) => { const note = event.target.value; setForm((previous) => ({ ...previous, note })); }} onBlur={() => keyboard.hide()} /></Field>
      <div className="sheet-actions">
        <button className="primary-button" disabled={!form.name.trim()}>{sheet.itemId ? t("Сохранить") : t("Добавить продукт")}</button>
        {shopPrice && (
          <a className="shop-price" href={shopPrice.url} target="_blank" rel="noopener">
            {t("В Linella: {name} — {price}", { name: shopPrice.name, price: formatLei(shopPrice.price) })}{shopPrice.step ? ` ${shopPrice.step}` : ""}
          </a>
        )}
        {sheet.itemId && <button type="button" className="destructive-button" onClick={app.deleteProduct}><TrashIcon /> {t("Удалить продукт")}</button>}
      </div>
    </form>
  );
}

export function ListNameSheet({ app, sheet }: Props<"list">) {
  const templates = alive(app.data.templates);
  return (
    <form className="sheet-form" onSubmit={app.submitListName}>
      <SheetClose app={app} />
      <Field label={t("Название списка")}><KeyboardInput placeholder={t("Например, покупки на выходные")} value={app.listName} onChange={(event) => app.setListName(event.target.value)} onBlur={() => app.keyboard.hide()} /></Field>
      <button className="primary-button" disabled={!app.listName.trim()}>{sheet.listId ? t("Сохранить") : t("Создать список")}</button>
      {!sheet.listId && templates.length > 0 && (
        <section className="sheet-section">
          <p className="settings-label">{t("ШАБЛОНЫ")}</p>
          <div className="chip-wrap">
            {templates.map((template: Template) => (
              <span className="chip" key={template.id}>
                <button type="button" onClick={() => app.addList(addProducts(newList(template.name), template.items))}><BookmarkIcon /> {template.name} <small>{template.items.length}</small></button>
                <button type="button" aria-label={t("Удалить шаблон {name}", { name: template.name })} onClick={() => app.removeEntity("templates", template.id, t("Шаблон удалён"))}><Cross2Icon /></button>
              </span>
            ))}
          </div>
        </section>
      )}
    </form>
  );
}

export function ListActionsSheet({ app }: Props<"actions">) {
  const list = app.sheetList;
  if (!list) return null;
  const sharing = app.data.sharing[list.id];
  const inFamily = (app.cloud.family?.members.length ?? 0) > 1;
  const action = (icon: ReactNode, label: string, onClick: () => void, detail?: string, danger = false) => (
    <button type="button" className={`setting-row action-row ${danger ? "action-danger" : ""}`} onClick={onClick}><span className="setting-icon">{icon}</span><span><b>{label}</b>{detail && <small>{detail}</small>}</span><ChevronRightIcon /></button>
  );
  return (
    <div className="sheet-form action-list">
      <SheetClose app={app} />
      {action(<Pencil1Icon />, t("Переименовать"), () => { app.setListName(list.name); app.openSheet({ kind: "list", listId: list.id }); })}
      {action(<PersonIcon />, t("Вести вместе"), () => app.openShare(list), sharing ? t("Участников: {members}", { members: sharing.members }) : t("Пригласить по ссылке или почте"))}
      {inFamily && (sharing?.owner || !sharing || list.personal) && (
        <button type="button" className="setting-row action-row" onClick={() => app.togglePersonal(list)}>
          <span className="setting-icon">{list.personal ? <LockClosedIcon /> : <HomeIcon />}</span>
          <span><b>{t("Семейный список")}</b><small>{list.personal ? t("Личный — видите только вы") : t("Виден всей семье")}</small></span>
          <span className={`theme-switch ${list.personal ? "" : "switch-on"}`}><i /></span>
        </button>
      )}
      {action(<Share1Icon />, t("Отправить текстом"), () => void app.sendAsText(list), t("В мессенджер или заметки"))}
      {action(<BellIcon />, t("Напоминание"), () => { app.setReminderValue(toLocalInput(list.remindAt ?? at(1, 10))); app.openSheet({ kind: "reminder", listId: list.id }); }, list.remindAt ? formatReminder(list.remindAt) : t("Не задано"))}
      {action(<MixIcon />, t("Магазин"), () => app.openSheet({ kind: "store-pick", listId: list.id }), app.storeName(list) ?? t("Не выбран"))}
      {action(<BookmarkIcon />, t("Сохранить как шаблон"), () => app.saveAsTemplate(list))}
      {action(<ArchiveIcon />, t("Завершить"), () => app.completeList(list), t("Перенести в историю"))}
      {action(sharing && !sharing.owner && !sharing.family ? <ExitIcon /> : <TrashIcon />, sharing && !sharing.owner && !sharing.family ? t("Покинуть список") : sharing?.family ? t("Удалить у всей семьи") : sharing ? t("Удалить у всех участников") : t("Удалить список"), () => app.deleteList(list), undefined, true)}
    </div>
  );
}

export function ShareSheet({ app }: Props<"share">) {
  const { cloud, shareState, setShareState, busy, run, notify } = app;
  const list = app.sheetList;
  if (!list) return null;
  if (!cloud.email) {
    return (
      <div className="sheet-form">
        <SheetClose app={app} />
        <p className="sheet-text">{t("Чтобы вести список вместе, войдите в аккаунт — так приложение сможет передавать изменения между участниками.")}</p>
        <button type="button" className="primary-button" onClick={() => app.openAccount("login")}><PersonIcon /> {t("Войти или создать аккаунт")}</button>
      </div>
    );
  }
  return (
    <div className="sheet-form">
      <SheetClose app={app} />
      {shareState.link ? (
        <div className="share-link">
          <span>{shareState.link}</span>
          <div className="share-link-actions">
            <button type="button" className="primary-button" onClick={() => void shareText(list.name, t("Присоединяйтесь к моему списку покупок «{name}»: {link}", { name: list.name, link: shareState.link })).then((result) => { if (result === "copied") notify(t("Ссылка скопирована")); })}><Share1Icon /> {t("Отправить")}</button>
            <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(shareState.link).then(() => notify(t("Ссылка скопирована")), () => undefined)}><CopyIcon /> {t("Копировать")}</button>
          </div>
          <small>{t("Ссылка действует 7 дней. По ней можно войти или создать аккаунт и сразу попасть в список.")}</small>
        </div>
      ) : (
        <button type="button" className="primary-button" disabled={busy} onClick={() => void run(async () => { const { link } = await cloud.share.invite(list.id); setShareState((previous) => ({ ...previous, link })); })}><Link2Icon /> {busy ? t("Подождите…") : t("Создать ссылку-приглашение")}</button>
      )}
      {cloud.config.email && (
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await cloud.share.invite(list.id, shareState.email); setShareState((previous) => ({ ...previous, email: "" })); notify(t("Приглашение отправлено")); }); }}>
          <Field label={t("Пригласить по почте")}><KeyboardInput type="email" inputMode="email" autoCapitalize="none" placeholder="name@example.com" value={shareState.email} onChange={(event) => { const email = event.target.value; setShareState((previous) => ({ ...previous, email })); }} onBlur={() => app.keyboard.hide()} /></Field>
          <button className="secondary-button" disabled={busy || !shareState.email.trim()}><EnvelopeClosedIcon /> {t("Отправить")}</button>
        </form>
      )}
      <FormError app={app} />
      {shareState.members.length > 0 && (
        <section className="sheet-section">
          <p className="settings-label">{t("УЧАСТНИКИ")}</p>
          {shareState.members.map((member) => <div className="member-row" key={member.email}><PersonIcon /> <span>{member.email}</span> <small>{member.you ? t("вы") : member.owner ? t("создатель") : ""}</small></div>)}
        </section>
      )}
    </div>
  );
}

export function ReminderSheet({ app }: Props<"reminder">) {
  const list = app.sheetList;
  if (!list) return null;
  const presets: [string, number][] = [[t("Через час"), Date.now() + 3_600_000], [t("Сегодня, 18:00"), at(0, 18)], [t("Завтра, 10:00"), at(1, 10)], [t("В пятницу, 18:00"), nextWeekday(5, 18)], [t("В субботу, 10:00"), nextWeekday(6, 10)]];
  return (
    <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); app.setReminder(list.id, new Date(app.reminderValue).getTime()); }}>
      <SheetClose app={app} />
      <div className="chip-wrap">
        {presets.filter(([, time]) => time > Date.now()).map(([label, time]) => <button type="button" className="chip-button" key={label} onClick={() => app.setReminder(list.id, time)}>{label}</button>)}
      </div>
      <Field label={t("Своё время")}><KeyboardInput type="datetime-local" value={app.reminderValue} onChange={(event) => app.setReminderValue(event.target.value)} onBlur={() => app.keyboard.hide()} /></Field>
      <FormError app={app} />
      <div className="sheet-actions">
        <button className="primary-button" disabled={!app.reminderValue}><BellIcon /> {t("Напомнить")}</button>
        {list.remindAt && <button type="button" className="destructive-button" onClick={() => app.setReminder(list.id, undefined)}>{t("Убрать напоминание")}</button>}
      </div>
    </form>
  );
}

export function StorePickSheet({ app }: Props<"store-pick">) {
  const list = app.sheetList;
  if (!list) return null;
  return (
    <div className="sheet-form action-list">
      <SheetClose app={app} />
      <button type="button" className={`pick-row ${!list.storeId ? "pick-active" : ""}`} onClick={() => { app.patchList(list.id, { storeId: undefined }); app.closeSheet(); }}>{t("Без магазина")} <small>{t("обычный порядок категорий")}</small></button>
      {alive(app.data.stores).map((store) => (
        <button type="button" key={store.id} className={`pick-row ${list.storeId === store.id ? "pick-active" : ""}`} onClick={() => { app.patchList(list.id, { storeId: store.id }); app.closeSheet(); app.notify(t("Порядок как в «{name}»", { name: store.name })); }}>{store.name}</button>
      ))}
      <button type="button" className="secondary-button" onClick={() => app.openStore(undefined, list.id)}><PlusIcon /> {t("Новый магазин")}</button>
    </div>
  );
}

export function PickListSheet({ app, sheet }: Props<"pick-list">) {
  return (
    <div className="sheet-form action-list">
      <SheetClose app={app} />
      {app.activeLists.map((list) => <button type="button" key={list.id} className="pick-row" onClick={() => app.addProductsTo(list.id, sheet.products, sheet.title)}>{list.name} <small>{progress(list).left} {t("осталось купить")}</small></button>)}
      <button type="button" className="secondary-button" onClick={() => app.addProductsTo(null, sheet.products, sheet.title)}><PlusIcon /> {t("Новый список «{title}»", { title: sheet.title })}</button>
    </div>
  );
}
