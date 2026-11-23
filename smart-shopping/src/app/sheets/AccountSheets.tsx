// Sign-in, registration, password and account removal.
import { TrashIcon } from "@radix-ui/react-icons";
import { KeyboardInput } from "../../mobile";
import { isNativeApp } from "../../device";
import { Field, FormError, SheetClose, type SheetProps } from "../ui";

export function AccountSheet({ app, sheet }: SheetProps<"account">) {
  const { step } = sheet;
  const { credentials, setCredential, cloud, busy, keyboard } = app;
  const emailInput = <Field label="Почта"><KeyboardInput type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="name@example.com" value={credentials.email} onChange={(event) => setCredential("email", event.target.value)} onBlur={() => keyboard.hide()} /></Field>;
  const passwordInput = (label: string, autoComplete: string) => <Field label={label}><KeyboardInput type="password" autoComplete={autoComplete} placeholder="Не короче 8 символов" value={credentials.password} onChange={(event) => setCredential("password", event.target.value)} onBlur={() => keyboard.hide()} /></Field>;
  const codeInput = <Field label="Код из письма"><KeyboardInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={credentials.code} onChange={(event) => setCredential("code", event.target.value.replace(/\D/g, ""))} onBlur={() => keyboard.hide()} /></Field>;
  const submitLabel = { login: "Войти", register: "Создать аккаунт", verify: "Подтвердить", forgot: "Отправить код", reset: "Сохранить пароль" }[step];
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
      {step === "login" && passwordInput("Пароль", "current-password")}
      {step === "register" && passwordInput("Пароль", "new-password")}
      {step === "reset" && passwordInput("Новый пароль", "new-password")}
      <FormError app={app} />
      <div className="sheet-actions">
        <button className="primary-button" disabled={busy || !canSubmit}>{busy ? "Подождите…" : submitLabel}</button>
        {step === "login" && <button type="button" className="text-action account-switch" onClick={() => app.openAccount("register")}>Создать новый аккаунт</button>}
        {step === "register" && <button type="button" className="text-action account-switch" onClick={() => app.openAccount("login")}>У меня уже есть аккаунт</button>}
        {step === "login" && cloud.config.email && <button type="button" className="text-action account-switch" onClick={() => app.openAccount("forgot")}>Забыли пароль?</button>}
        {step === "verify" && <button type="button" className="text-action account-switch" disabled={busy} onClick={() => void app.run(() => cloud.account.resendVerification(), () => app.notify("Новый код отправлен"))}>Отправить код ещё раз</button>}
        {step === "verify" && <button type="button" className="text-action account-switch" onClick={app.closeSheet}>Подтвержу позже</button>}
        {(step === "forgot" || step === "reset") && <button type="button" className="text-action account-switch" onClick={() => app.openAccount("login")}>Вернуться ко входу</button>}
      </div>
      {(step === "login" || step === "register") && cloud.config.googleClientId && (
        <div className="google-block">
          <span className="divider-text">или</span>
          {isNativeApp
            ? <button type="button" className="secondary-button google-button" onClick={() => void app.run(() => cloud.account.startAppGoogleLogin())}><span className="google-mark">G</span> Продолжить с Google</button>
            : <div ref={app.googleButton} className="google-slot" />}
        </div>
      )}
    </form>
  );
}

export function PasswordSheet({ app }: SheetProps<"password">) {
  const { credentials, setCredential, cloud, busy, keyboard } = app;
  return (
    <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); void app.run(() => cloud.account.changePassword(credentials.current, credentials.password), () => { app.closeSheet(); app.notify("Пароль сохранён"); }); }}>
      <SheetClose app={app} />
      {cloud.hasPassword && <Field label="Текущий пароль"><KeyboardInput type="password" autoComplete="current-password" value={credentials.current} onChange={(event) => setCredential("current", event.target.value)} onBlur={() => keyboard.hide()} /></Field>}
      <Field label="Новый пароль"><KeyboardInput type="password" autoComplete="new-password" placeholder="Не короче 8 символов" value={credentials.password} onChange={(event) => setCredential("password", event.target.value)} onBlur={() => keyboard.hide()} /></Field>
      <FormError app={app} />
      <button className="primary-button" disabled={busy || credentials.password.length < 8 || (cloud.hasPassword && !credentials.current)}>{busy ? "Подождите…" : "Сохранить пароль"}</button>
    </form>
  );
}

export function DeleteAccountSheet({ app }: SheetProps<"delete-account">) {
  const { credentials, setCredential, cloud, busy, keyboard } = app;
  return (
    <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); void app.run(() => cloud.account.deleteAccount(credentials.password), () => { app.closeSheet(); app.notify("Аккаунт удалён"); }); }}>
      <SheetClose app={app} />
      <p className="sheet-text">Совместные списки останутся у других участников. Отменить удаление нельзя.</p>
      {cloud.hasPassword && <Field label="Пароль для подтверждения"><KeyboardInput type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredential("password", event.target.value)} onBlur={() => keyboard.hide()} /></Field>}
      <FormError app={app} />
      <button className="danger-button" disabled={busy || (cloud.hasPassword && !credentials.password)}><TrashIcon /> {busy ? "Подождите…" : "Удалить аккаунт навсегда"}</button>
    </form>
  );
}
