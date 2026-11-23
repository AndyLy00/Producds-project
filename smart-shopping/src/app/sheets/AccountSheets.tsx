// Sign-in, registration, password and account removal.
import { TrashIcon } from "@radix-ui/react-icons";
import { KeyboardInput } from "../../mobile";
import { isNativeApp } from "../../device";
import { Field, FormError, SheetClose, type SheetProps } from "../ui";
import { t } from "../../i18n";

export function AccountSheet({ app, sheet }: SheetProps<"account">) {
  const { step } = sheet;
  const { credentials, setCredential, cloud, busy, keyboard } = app;
  const emailInput = <Field label={t("Почта")}><KeyboardInput type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="name@example.com" value={credentials.email} onChange={(event) => setCredential("email", event.target.value)} onBlur={() => keyboard.hide()} /></Field>;
  const passwordInput = (label: string, autoComplete: string) => <Field label={label}><KeyboardInput type="password" autoComplete={autoComplete} placeholder={t("Не короче 8 символов")} value={credentials.password} onChange={(event) => setCredential("password", event.target.value)} onBlur={() => keyboard.hide()} /></Field>;
  const codeInput = <Field label={t("Код из письма")}><KeyboardInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={credentials.code} onChange={(event) => setCredential("code", event.target.value.replace(/\D/g, ""))} onBlur={() => keyboard.hide()} /></Field>;
  const submitLabel = { login: t("Войти"), register: t("Создать аккаунт"), verify: t("Подтвердить"), forgot: t("Отправить код"), reset: t("Сохранить пароль") }[step];
  const canSubmit = {
    login: credentials.email.trim() && credentials.password,
    register: credentials.email.trim() && credentials.password,
    verify: credentials.code.length === 6,
    forgot: credentials.email.trim(),
    reset: credentials.code.length === 6 && credentials.password,
  }[step];
  return (
    <form className="sheet-form" onSubmit={app.submitAccount}>
      <SheetClose app={app} />
      {(step === "login" || step === "register" || step === "forgot") && emailInput}
      {(step === "verify" || step === "reset") && codeInput}
      {step === "login" && passwordInput(t("Пароль"), "current-password")}
      {step === "register" && passwordInput(t("Пароль"), "new-password")}
      {step === "reset" && passwordInput(t("Новый пароль"), "new-password")}
      <FormError app={app} />
      <div className="sheet-actions">
        <button className="primary-button" disabled={busy || !canSubmit}>{busy ? t("Подождите…") : submitLabel}</button>
        {step === "login" && <button type="button" className="text-action account-switch" onClick={() => app.openAccount("register")}>{t("Создать новый аккаунт")}</button>}
        {step === "register" && <button type="button" className="text-action account-switch" onClick={() => app.openAccount("login")}>{t("У меня уже есть аккаунт")}</button>}
        {step === "login" && cloud.config.email && <button type="button" className="text-action account-switch" onClick={() => app.openAccount("forgot")}>{t("Забыли пароль?")}</button>}
        {step === "verify" && <button type="button" className="text-action account-switch" disabled={busy} onClick={() => void app.run(() => cloud.account.resendVerification(), () => app.notify(t("Новый код отправлен")))}>{t("Отправить код ещё раз")}</button>}
        {step === "verify" && <button type="button" className="text-action account-switch" onClick={app.closeSheet}>{t("Подтвержу позже")}</button>}
        {(step === "forgot" || step === "reset") && <button type="button" className="text-action account-switch" onClick={() => app.openAccount("login")}>{t("Вернуться ко входу")}</button>}
      </div>
      {(step === "login" || step === "register") && cloud.config.googleClientId && (
        <div className="google-block">
          <span className="divider-text">{t("или")}</span>
          {isNativeApp
            ? <button type="button" className="secondary-button google-button" onClick={() => void app.run(() => cloud.account.startAppGoogleLogin())}><span className="google-mark">G</span> {t("Продолжить с Google")}</button>
            : <div ref={app.googleButton} className="google-slot" />}
        </div>
      )}
    </form>
  );
}

export function PasswordSheet({ app }: SheetProps<"password">) {
  const { credentials, setCredential, cloud, busy, keyboard } = app;
  return (
    <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); void app.run(() => cloud.account.changePassword(credentials.current, credentials.password), () => { app.closeSheet(); app.notify(t("Пароль сохранён")); }); }}>
      <SheetClose app={app} />
      {cloud.hasPassword && <Field label={t("Текущий пароль")}><KeyboardInput type="password" autoComplete="current-password" value={credentials.current} onChange={(event) => setCredential("current", event.target.value)} onBlur={() => keyboard.hide()} /></Field>}
      <Field label={t("Новый пароль")}><KeyboardInput type="password" autoComplete="new-password" placeholder={t("Не короче 8 символов")} value={credentials.password} onChange={(event) => setCredential("password", event.target.value)} onBlur={() => keyboard.hide()} /></Field>
      <FormError app={app} />
      <button className="primary-button" disabled={busy || credentials.password.length < 8 || (cloud.hasPassword && !credentials.current)}>{busy ? t("Подождите…") : t("Сохранить пароль")}</button>
    </form>
  );
}

export function DeleteAccountSheet({ app }: SheetProps<"delete-account">) {
  const { credentials, setCredential, cloud, busy, keyboard } = app;
  return (
    <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); void app.run(() => cloud.account.deleteAccount(credentials.password), () => { app.closeSheet(); app.notify(t("Аккаунт удалён")); }); }}>
      <SheetClose app={app} />
      <p className="sheet-text">{t("Совместные списки останутся у других участников. Отменить удаление нельзя.")}</p>
      {cloud.hasPassword && <Field label={t("Пароль для подтверждения")}><KeyboardInput type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredential("password", event.target.value)} onBlur={() => keyboard.hide()} /></Field>}
      <FormError app={app} />
      <button className="danger-button" disabled={busy || (cloud.hasPassword && !credentials.password)}><TrashIcon /> {busy ? t("Подождите…") : t("Удалить аккаунт навсегда")}</button>
    </form>
  );
}
