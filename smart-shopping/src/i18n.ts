// Languages of the app: Russian, English and Romanian.
//
// The Russian text itself is the key: t("Мои списки") returns the English or Romanian
// translation from translations/en.ts or translations/ro.ts, or the Russian text when there is none.
// Placeholders are written {name} and filled from `params`. tests/i18n.test.mjs checks that every
// text passed to t() has both translations.
//
// Data is never translated where it is stored: default categories and units stay in Russian in
// the lists (so lists shared between people with different languages keep working) and are only
// translated when shown.
import en from "./translations/en.ts";
import ro from "./translations/ro.ts";

export type Language = "ru" | "en" | "ro";
export const languages: { id: Language; name: string }[] = [
  { id: "ru", name: "Русский" },
  { id: "en", name: "English" },
  { id: "ro", name: "Română" },
];

const STORAGE_KEY = "smart-shopping.language";
const dictionaries: Record<Language, Record<string, string>> = { ru: {}, en, ro };
const locales: Record<Language, string> = { ru: "ru-RU", en: "en-GB", ro: "ro-RO" };

function detect(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ru" || saved === "en" || saved === "ro") return saved;
  } catch {
    // No storage: follow the device.
  }
  const preferred = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "ru" || base === "be" || base === "uk" || base === "kk") return "ru";
    if (base === "ro" || base === "mo") return "ro";
    if (base === "en") return "en";
  }
  return typeof navigator === "undefined" ? "ru" : "en";
}

let current: Language = detect();

export function language() {
  return current;
}

// The locale for dates and numbers: "ru-RU", "en-GB" or "ro-RO".
export function locale() {
  return locales[current];
}

export function setLanguage(next: Language) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Remembered until the app closes.
  }
  if (typeof document !== "undefined") document.documentElement.lang = next;
}

if (typeof document !== "undefined") document.documentElement.lang = current;

export function t(source: string, params?: Record<string, string | number>) {
  const text = dictionaries[current][source] ?? source;
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;
}
