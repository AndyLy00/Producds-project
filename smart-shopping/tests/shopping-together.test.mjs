// Shopping together in a family: who goes to the store, who added and who bought a product
// (src/model.ts) and how the server keeps it (api/_clean.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanList } from "../api/_clean.js";
import { currentShopper, personName, stampNewItems } from "../src/model.ts";

const item = (id, extra = {}) => ({ id, name: id, quantity: "1", unit: "шт.", category: "", note: "", purchased: false, favorite: false, order: 0, updatedAt: 1, ...extra });
const list = (items, extra = {}) => ({ id: "l", name: "Неделя", createdAt: 1, updatedAt: 1, sortMode: "category", items, ...extra });

test("new products get the name of whoever added them, old ones keep theirs", () => {
  const before = list([item("milk", { addedBy: "anna@example.com" })]);
  const after = list([...before.items, item("bread")]);
  const stamped = stampNewItems(before, after, "ion@example.com");
  assert.equal(stamped.items[0].addedBy, "anna@example.com");
  assert.equal(stamped.items[1].addedBy, "ion@example.com");
  // Without an account nothing is stamped, and an unchanged list stays the same object.
  assert.equal(stampNewItems(before, after, null), after);
  assert.equal(stampNewItems(before, before, "ion@example.com"), before);
});

test("a person is named by the part of the address before @", () => {
  assert.equal(personName("anna.popescu@example.com"), "anna.popescu");
});

test("the server keeps who goes to the store, who added and who bought", () => {
  const cleaned = cleanList(list(
    [
      item("milk", { purchased: true, purchasedBy: "Anna@Example.com", addedBy: "ion@example.com" }),
      // Bought-by makes no sense for a product still to buy; a malformed address is dropped.
      item("bread", { purchasedBy: "anna@example.com", addedBy: "not an address" }),
    ],
    { shopper: { email: "anna@example.com", by: "ion@example.com", at: 5 }, completedAt: 9, completedBy: "anna@example.com" },
  ));
  assert.equal(cleaned.items[0].purchasedBy, "anna@example.com");
  assert.equal(cleaned.items[0].addedBy, "ion@example.com");
  assert.equal(cleaned.items[1].purchasedBy, undefined);
  assert.equal(cleaned.items[1].addedBy, undefined);
  assert.deepEqual(cleaned.shopper, { email: "anna@example.com", by: "ion@example.com", at: 5 });
  assert.equal(cleaned.completedBy, "anna@example.com");
  assert.equal(cleanList(list([], { shopper: { email: "anna@example.com" } })).shopper, undefined);
  assert.equal(cleanList(list([], { completedBy: "anna@example.com" })).completedBy, undefined);
});

test("the shopper shows only while the list is to buy and they are still in the family", () => {
  const shopper = { email: "anna@example.com", by: "ion@example.com", at: 5 };
  const family = ["anna@example.com", "ion@example.com"];
  assert.deepEqual(currentShopper(list([], { shopper }), family), shopper);
  assert.equal(currentShopper(list([], { shopper }), ["ion@example.com"]), undefined);
  assert.equal(currentShopper(list([], { shopper }), []), undefined);
  assert.equal(currentShopper(list([], { shopper, completedAt: 9 }), family), undefined);
});
