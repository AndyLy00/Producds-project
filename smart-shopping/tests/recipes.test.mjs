// Recipe steps (src/model.ts): timers found in the text, and recipes saved before steps existed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMinutes, guessMinutes, stepsAsNote, stepsOf, totalMinutes } from "../src/model.ts";

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
