// "A newer version is available" banner of the Android app.
// Every push to main is built on GitHub and published as a release tagged build-<number>
// (.github/workflows/android.yml); the app compares that number with its own.
import { useEffect, useState } from "react";
import { t } from "../i18n";

declare const __APP_VERSION_CODE__: number;
// "play" in the Google Play build: Play updates the app itself, and its rules forbid apps that
// update themselves any other way.
declare const __APP_STORE__: string;
const fromPlay = typeof __APP_STORE__ === "string" && __APP_STORE__ === "play";

const LATEST_RELEASE = "https://api.github.com/repos/AndyLy00/Producds-project/releases/latest";
const DISMISSED_KEY = "korzina.update.dismissed";
const CHECK_INTERVAL = 30 * 60 * 1000;

type Update = { code: number; name: string; url: string };

async function fetchUpdate(): Promise<Update | null> {
  const response = await fetch(LATEST_RELEASE, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) return null;
  const release = (await response.json()) as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    assets?: { name: string; browser_download_url: string }[];
  };
  const code = Number(/^build-(\d+)$/.exec(release.tag_name ?? "")?.[1]);
  if (!Number.isInteger(code) || code <= __APP_VERSION_CODE__) return null;
  const url = release.assets?.find((asset) => asset.name.endsWith(".apk"))?.browser_download_url ?? release.html_url;
  return url ? { code, name: release.name ?? t("сборка {code}", { code }), url } : null;
}

function readDismissed() {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
  } catch {
    return 0;
  }
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    // A local build has no build number to compare with.
    if (__APP_VERSION_CODE__ === 0 || fromPlay) return;
    let lastCheck = 0;
    let active = true;
    const check = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < CHECK_INTERVAL) return;
      lastCheck = Date.now();
      // Being offline or rate-limited just means no banner until the next check.
      fetchUpdate().then(
        (found) => active && setUpdate(found),
        () => undefined,
      );
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!update || update.code <= dismissed) return null;

  const dismiss = () => {
    setDismissed(update.code);
    try {
      localStorage.setItem(DISMISSED_KEY, String(update.code));
    } catch {
      // Without storage the banner simply returns on the next launch.
    }
  };

  return (
    <div className="update-banner" role="status">
      <div className="update-banner-text">
        <strong>{t("Доступно обновление")}</strong>
        <span>{update.name}</span>
      </div>
      {/* Leaving the app's own origin makes Capacitor hand the link to the browser, which downloads the APK. */}
      <button type="button" className="update-banner-action" onClick={() => window.location.assign(update.url)}>
        {t("Обновить")}
      </button>
      <button type="button" className="update-banner-close" aria-label={t("Скрыть")} onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
