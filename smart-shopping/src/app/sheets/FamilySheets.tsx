// Family: who is in it, inviting people, leaving; and agreeing to join from an invitation.
import { CopyIcon, Cross2Icon, EnvelopeClosedIcon, ExitIcon, HomeIcon, Link2Icon, PersonIcon, Share1Icon } from "@radix-ui/react-icons";
import { useState } from "react";
import { KeyboardInput } from "../../mobile";
import { shareText } from "../../device";
import { Field, FormError, SheetClose, type SheetProps } from "../ui";
import { t } from "../../i18n";

export function FamilySheet({ app }: SheetProps<"family">) {
  const { cloud, familyState, setFamilyState, busy, run, notify } = app;
  // Leaving is asked about first: it takes the family's lists off this phone.
  const [leaving, setLeaving] = useState(false);
  if (!cloud.email) {
    return (
      <div className="sheet-form">
        <SheetClose app={app} />
        <p className="sheet-text">{t("Чтобы завести семью, войдите в аккаунт — так списки смогут передаваться между вашими телефонами.")}</p>
        <button type="button" className="primary-button" onClick={() => app.openAccount("login")}><PersonIcon /> {t("Войти или создать аккаунт")}</button>
      </div>
    );
  }
  const family = cloud.family;
  const inFamily = Boolean(family && family.members.length > 1);
  const createLink = () => void run(async () => { const link = await cloud.familyActions.invite(); setFamilyState((previous) => ({ ...previous, link })); });
  return (
    <div className="sheet-form">
      <SheetClose app={app} />
      {family && family.members.length > 0 && (
        <section className="sheet-section">
          <p className="settings-label">{t("В СЕМЬЕ")}</p>
          {family.members.map((member) => (
            <div className="member-row" key={member.email}>
              <PersonIcon /> <span>{member.email}</span> <small>{member.you ? t("вы") : member.owner ? t("создатель") : ""}</small>
              {family.owner && !member.you && (
                <button type="button" className="member-remove" aria-label={t("Убрать {email} из семьи", { email: member.email })} disabled={busy} onClick={() => void run(() => cloud.familyActions.remove(member.email), () => notify(t("{email} больше не в семье", { email: member.email })))}><Cross2Icon /></button>
              )}
            </div>
          ))}
          {inFamily && !leaving && <button type="button" className="text-action family-leave" disabled={busy} onClick={() => setLeaving(true)}><ExitIcon /> {t("Выйти из семьи")}</button>}
        </section>
      )}
      {inFamily && leaving && (
        <section className="leave-confirm" role="alertdialog" aria-label={t("Выйти из семьи?")}>
          <b>{t("Выйти из семьи?")}</b>
          <p>{t("Списки других членов семьи пропадут с этого телефона, а ваши списки они больше не увидят. Сами списки никуда не денутся.")}</p>
          {family?.owner && <p>{t("Вы создатель семьи — управлять ею станет следующий участник.")}</p>}
          <p>{t("Вернуться можно только по новому приглашению.")}</p>
          <div className="sheet-actions">
            <button type="button" className="destructive-button" disabled={busy} onClick={() => { setLeaving(false); app.leaveFamily(); }}><ExitIcon /> {busy ? t("Подождите…") : t("Выйти")}</button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setLeaving(false)}>{t("Остаться")}</button>
          </div>
        </section>
      )}
      {familyState.link ? (
        <div className="share-link">
          <span>{familyState.link}</span>
          <div className="share-link-actions">
            <button type="button" className="primary-button" onClick={() => void shareText(t("Семья в «Корзине»"), t("Присоединяйтесь к моей семье в «Корзине» — будем вести списки покупок вместе: {link}", { link: familyState.link })).then((result) => { if (result === "copied") notify(t("Ссылка скопирована")); })}><Share1Icon /> {t("Отправить")}</button>
            <button type="button" className="secondary-button" onClick={() => void navigator.clipboard?.writeText(familyState.link).then(() => notify(t("Ссылка скопирована")), () => undefined)}><CopyIcon /> {t("Копировать")}</button>
          </div>
          <small>{t("Ссылка действует 7 дней. Кто откроет её и войдёт в аккаунт, попадёт в вашу семью.")}</small>
        </div>
      ) : (
        <button type="button" className="primary-button" disabled={busy} onClick={createLink}><Link2Icon /> {busy ? t("Подождите…") : family ? t("Пригласить ещё человека") : t("Создать семью и пригласить")}</button>
      )}
      {cloud.config.email && (
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await cloud.familyActions.invite(familyState.email); setFamilyState((previous) => ({ ...previous, email: "" })); notify(t("Приглашение отправлено")); }); }}>
          <Field label={t("Пригласить по почте")}><KeyboardInput type="email" inputMode="email" autoCapitalize="none" placeholder="name@example.com" value={familyState.email} onChange={(event) => { const email = event.target.value; setFamilyState((previous) => ({ ...previous, email })); }} onBlur={() => app.keyboard.hide()} /></Field>
          <button className="secondary-button" disabled={busy || !familyState.email.trim()}><EnvelopeClosedIcon /> {t("Отправить")}</button>
        </form>
      )}
      <FormError app={app} />
    </div>
  );
}

export function FamilyJoinSheet({ app, sheet }: SheetProps<"family-join">) {
  const { preview } = app.familyState;
  return (
    <div className="sheet-form">
      <SheetClose app={app} />
      <div className="family-invite">
        <span className="setting-icon"><HomeIcon /></span>
        <p>{preview?.from ? <><b>{preview.from}</b> {t("приглашает вас в семью.")}</> : t("Вас приглашают в семью.")}{preview && preview.members > 1 ? t(" Сейчас в ней {members} чел.", { members: preview.members }) : ""}</p>
      </div>
      <p className="sheet-text">{t("В семье все списки общие: ваши списки увидят все в семье, а вы — их списки. Любой свой список можно потом сделать личным в меню «⋯».")}</p>
      <FormError app={app} />
      <div className="sheet-actions">
        <button type="button" className="primary-button" disabled={app.busy || preview?.already} onClick={() => app.joinFamily(sheet.token)}>{preview?.already ? t("Вы уже в этой семье") : app.busy ? t("Подождите…") : t("Присоединиться")}</button>
        <button type="button" className="text-action account-switch" onClick={app.closeSheet}>{t("Не сейчас")}</button>
      </div>
    </div>
  );
}
