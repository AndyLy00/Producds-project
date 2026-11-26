// Products added with the home-screen widget's "+" (src/model.ts, addWidgetProducts; android
// QuickAddActivity.java queues them while the app is closed).
import assert from "node:assert/strict";
import { test } from "node:test";
import { setLanguage } from "../src/i18n.ts";
import { addWidgetProducts, alive, defaultCategories, splitProducts } from "../src/model.ts";

setLanguage("ru");

const list = (id, createdAt, extra = {}) => ({ id, name: id, createdAt, updatedAt: createdAt, sortMode: "category", items: [], ...extra });
const data = (lists) => ({ lists, stores: [], templates: [], recipes: [], categories: [], settings: {}, sharing: {} });

test("several products can be typed at once, a decimal comma stays", () => {
  assert.deepEqual(splitProducts("молоко 2 л, хлеб;  сыр\nкартофель 1,5 кг"), ["молоко 2 л", "хлеб", "сыр", "картофель 1,5 кг"]);
  assert.deepEqual(splitProducts(" ,  \n"), []);
});

test("products go to the list the widget showed", () => {
  const result = addWidgetProducts(data([list("old", 1), list("shown", 2)]), [{ listId: "old", text: "молоко 2 л, хлеб", at: 3 }], defaultCategories, "Покупки");
  assert.deepEqual(result.added, ["молоко", "хлеб"]);
  assert.equal(result.listId, "old");
  const items = alive(result.data.lists.find((entry) => entry.id === "old").items);
  assert.deepEqual(items.map((item) => [item.name, item.quantity, item.unit]), [["молоко", "2", "л"], ["хлеб", "1", "шт."]]);
});

test("without that list they go to the newest open list, or to a new one", () => {
  const lists = [list("done", 9, { completedAt: 10 }), list("older", 1), list("newer", 2)];
  assert.equal(addWidgetProducts(data(lists), [{ listId: "gone", text: "сыр", at: 3 }], defaultCategories, "Покупки").listId, "newer");
  const fresh = addWidgetProducts(data([list("done", 9, { completedAt: 10 })]), [{ listId: "", text: "сыр", at: 3 }], defaultCategories, "Покупки");
  const created = fresh.data.lists.find((entry) => entry.id === fresh.listId);
  assert.equal(created.name, "Покупки");
  assert.equal(created.items[0].name, "сыр");
});

test("an empty entry changes nothing", () => {
  const before = data([list("a", 1)]);
  const result = addWidgetProducts(before, [{ listId: "a", text: "  ", at: 1 }], defaultCategories, "Покупки");
  assert.equal(result.data, before);
  assert.deepEqual(result.added, []);
});
