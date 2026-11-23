// Screen state of the app and small helpers shared by its parts.
import { units, type Product, type ShoppingData } from "../model";
import { t } from "../i18n";

export type Tab = "lists" | "favorites" | "recipes" | "history" | "settings";
export type AccountStep = "login" | "register" | "verify" | "forgot" | "reset";
export type Sheet =
  | { kind: "product"; itemId?: string }
  | { kind: "list"; listId?: string }
  | { kind: "actions"; listId: string }
  | { kind: "share"; listId: string }
  | { kind: "reminder"; listId: string }
  | { kind: "store-pick"; listId: string }
  | { kind: "pick-list"; title: string; products: Product[] }
  | { kind: "recipe"; recipeId?: string }
  | { kind: "store"; storeId?: string; forListId?: string }
  | { kind: "categories" }
  | { kind: "account"; step: AccountStep }
  | { kind: "password" }
  | { kind: "delete-account" }
  | { kind: "family" }
  | { kind: "language" }
  | { kind: "family-join"; token: string };
export type SheetOf<K extends Sheet["kind"]> = Extract<Sheet, { kind: K }>;
export type Toast = { text: string; undo?: ShoppingData };
// A step being edited: `minutes` as typed; `auto` while they still follow the step's text.
export type StepForm = { id: string; text: string; minutes: string; auto: boolean };
export type RecipeForm = { name: string; ingredients: string; photo?: string; steps: StepForm[] };

export const blankProduct = (): Product => ({ name: "", quantity: "1", unit: units[0], category: "", note: "" });
export const errorText = (error: unknown) => (error instanceof Error ? error.message : t("Что-то пошло не так. Попробуйте ещё раз."));

export function toLocalInput(time: number) {
  return new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function at(daysFromToday: number, hours: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hours, 0, 0, 0);
  return date.getTime();
}

export function nextWeekday(weekday: number, hours: number) {
  return at(((weekday - new Date().getDay() + 7) % 7) || 7, hours);
}

// Invitation opened as https://…/join?invite=… or …/join?family=… (on the site, or in the app
// through an app link).
export function inviteFromAddress(): Invite | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const list = params.get("invite");
  const family = params.get("family");
  if (list || family) window.history.replaceState(null, "", "/");
  return list ? { kind: "list", token: list } : family ? { kind: "family", token: family } : null;
}

// An invitation into a shared list, or into a family (?family=…).
export type Invite = { kind: "list" | "family"; token: string };
