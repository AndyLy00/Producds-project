// Screen state of the app and small helpers shared by its parts.
import type { Product, ShoppingData } from "../model";

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
  | { kind: "delete-account" };
export type SheetOf<K extends Sheet["kind"]> = Extract<Sheet, { kind: K }>;
export type Toast = { text: string; undo?: ShoppingData };

export const blankProduct = (): Product => ({ name: "", quantity: "1", unit: "шт.", category: "", note: "" });
export const errorText = (error: unknown) => (error instanceof Error ? error.message : "Что-то пошло не так. Попробуйте ещё раз.");

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

// Invitation opened as https://…/join?invite=… (on the site, or in the app through an app link).
export function inviteFromAddress() {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.search).get("invite");
  if (token) window.history.replaceState(null, "", "/");
  return token;
}
