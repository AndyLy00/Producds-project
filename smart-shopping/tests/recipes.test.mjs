// Recipe steps (src/model.ts): timers found in the text, and recipes saved before steps existed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setLanguage } from "../src/i18n.ts";
import { formatMinutes, guessCategory, guessMinutes, parseProducts, stepsAsNote, stepsOf, totalMinutes } from "../src/model.ts";

// Node reports its own language; these checks are written in Russian unless they say otherwise.
setLanguage("ru");

test("a duration in the text of a step becomes its timer", () => {
  assert.equal(guessMinutes("Варить 10 минут"), 10);
  assert.equal(guessMinutes("Тушить 10–12 мин. под крышкой"), 12);
  assert.equal(guessMinutes("Запекать 1,5 часа"), 90);
  assert.equal(guessMinutes("Томить 2 ч"), 120);
  assert.equal(guessMinutes("Посолить по вкусу"), undefined);
  assert.equal(guessMinutes("Взять 2 яйца"), undefined);
  assert.equal(guessMinutes("Добавить 2 чайные ложки сахара"), undefined);
  assert.equal(guessMinutes("Подождать минуту"), undefined);
  assert.equal(guessMinutes("Варить 3 минуты, помешивая"), 3);
});

test("a recipe without steps reads its old method line by line", () => {
  const steps = stepsOf({ id: "r", note: "1. Нарезать лук\n\n2. Обжарить 5 минут", steps: undefined });
  assert.deepEqual(steps.map((step) => [step.text, step.minutes]), [["Нарезать лук", undefined], ["Обжарить 5 минут", 5]]);
  assert.equal(stepsOf({ id: "r", note: "", steps: [] }).length, 0);
});

test("steps are kept as text for older app versions, and their time adds up", () => {
  const steps = [{ id: "a", text: "Замесить тесто", minutes: 15 }, { id: "b", text: "Печь", minutes: 50 }];
  assert.equal(stepsAsNote(steps), "1. Замесить тесто\n2. Печь");
  assert.deepEqual(stepsOf({ id: "r", note: stepsAsNote(steps) }).map((step) => step.text), ["Замесить тесто", "Печь"]);
  assert.equal(totalMinutes(steps), 65);
  assert.equal(formatMinutes(65), "1 ч 5 мин");
  assert.equal(formatMinutes(40), "40 мин");
});

test("timers, categories and units are understood in English and Romanian too", () => {
  assert.equal(guessMinutes("Bake for 20 minutes"), 20);
  assert.equal(guessMinutes("Simmer 1.5 hours"), 90);
  assert.equal(guessMinutes("Rest 10 min"), 10);
  assert.equal(guessMinutes("Fierbeți 15 minute"), 15);
  assert.equal(guessMinutes("Coaceți 1,5 ore"), 90);
  assert.equal(guessMinutes("Add 2 eggs"), undefined);
  assert.equal(guessCategory("Milk"), "Молочные продукты");
  assert.equal(guessCategory("Roșii"), "Овощи и фрукты");
  assert.equal(guessCategory("Piept de pui"), "Мясо и рыба");
  assert.equal(guessCategory("Ciocolată"), "Сладости и снеки");
  const categories = ["Овощи и фрукты", "Мясо и рыба", "Молочные продукты", "Бакалея"];
  assert.deepEqual(parseProducts(["Flour 500 g", "Ouă 3 buc.", "Sugar 1 pack"].join("\n"), categories).map((product) => [product.name, product.quantity, product.unit]), [
    ["Flour", "500", "г"],
    ["Ouă", "3", "шт."],
    ["Sugar", "1", "уп."],
  ]);
});

test("times are shown in the chosen language", () => {
  setLanguage("en");
  assert.equal(formatMinutes(65), "1 h 5 min");
  setLanguage("ro");
  assert.equal(formatMinutes(40), "40 min");
  setLanguage("ru");
  assert.equal(formatMinutes(120), "2 ч");
});
