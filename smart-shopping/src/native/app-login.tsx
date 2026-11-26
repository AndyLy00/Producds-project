// Google sign-in for the Android app. Google does not allow its sign-in inside an app's WebView,
// so the app opens this page in the browser (cloud-sync.ts, startAppGoogleLogin). After Google
// confirms the account the server issues a one-time code bound to the app's challenge, and the
// page returns to the app through the korzina://auth link.
import { useEffect, useRef, useState } from "react";
import { api, type AuthConfig } from "../cloud-sync";
import { renderGoogleButton } from "../device";
import { t } from "../i18n";

export function AppLoginPage({ challenge }: { challenge: string }) {
  const slot = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ status: "start" | "done" | "error"; message: string; link?: string }>({ status: "start", message: "" });

  useEffect(() => {
    let cancelled = false;
    api<AuthConfig>("/api/auth")
      .then(async (config) => {
        if (!config.googleClientId) throw new Error(t("Вход через Google пока не настроен."));
        if (cancelled || !slot.current) return;
        await renderGoogleButton(slot.current, config.googleClientId, (credential) => {
          api<{ code: string }>("/api/auth", { action: "google", credential, challenge }).then(
            ({ code }) => {
              // Chrome on Android follows an intent: link to the app more reliably than a custom
              // scheme, but only after a tap: Google's answer arrives without one, so the redirect
              // below is often ignored. The button, or simply going back to the app, finishes the
              // sign-in (the app claims it itself, see cloud-sync.ts).
              const query = `auth?code=${encodeURIComponent(code)}`;
              const android = /Android/i.test(navigator.userAgent);
              const link = android ? `intent://${query}#Intent;scheme=korzina;package=io.github.andyly00.korzina;end` : `korzina://${query}`;
              setState({ status: "done", message: t("Готово! Нажмите «Открыть приложение» или просто вернитесь в «Корзину»."), link });
              window.location.href = link;
            },
            (error: Error) => setState({ status: "error", message: error.message }),
          );
        });
      })
      .catch((error: Error) => setState({ status: "error", message: error.message }));
    return () => {
      cancelled = true;
    };
  }, [challenge]);

  return (
    <main className="app-login">
      <span className="brand-mark" aria-hidden="true">{t("К")}</span>
      <h1>{t("Вход в «Корзину»")}</h1>
      <p>{t("Войдите через Google, и приложение на телефоне откроется уже с вашим аккаунтом.")}</p>
      <div ref={slot} className="app-login-slot" hidden={state.status === "done"} />
      {state.message && <p className={state.status === "error" ? "form-error" : "app-login-done"}>{state.message}</p>}
      {state.link && <a className="primary-button" href={state.link}>{t("Открыть приложение")}</a>}
    </main>
  );
}
