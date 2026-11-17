// Merging rules shared by the app and the server (shared/merge.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeEntities, mergeList, mergeLists, mergeProfile } from "../shared/merge.js";

const entity = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra });

test("the copy changed last wins, and removals travel as tombstones", () => {
  const merged = mergeEntities([entity("a", 5, { name: "old" }), entity("b", 5)], [entity("a", 9, { name: "new" }), entity("b", 7, { deleted: true }), entity("c", 1)]);
  assert.deepEqual(merged, [entity("a", 9, { name: "new" }), entity("b", 7, { deleted: true }), entity("c", 1)]);
});

test("merging is the same in either order and repeatable", () => {
  const mine = [entity("a", 5, { name: "x" }), entity("b", 3)];
  const theirs = [entity("a", 5, { name: "y" }), entity("b", 3, { deleted: true })];
  const one = mergeEntities(mine, theirs);
  const other = mergeEntities(theirs, mine);
  const sort = (values) => [...values].sort((p, q) => p.id.localeCompare(q.id));
  assert.deepEqual(sort(one), sort(other));
  assert.deepEqual(sort(mergeEntities(one, theirs)), sort(one));
});

test("list fields and products of a list merge separately", () => {
  const renamed = { id: "L", name: "Новое имя", updatedAt: 10, items: [entity("a", 1, { purchased: false })] };
  const bought = { id: "L", name: "Старое имя", updatedAt: 2, items: [entity("a", 8, { purchased: true }), entity("b", 4)] };
  const merged = mergeList(renamed, bought);
  assert.equal(merged.name, "Новое имя");
  assert.deepEqual(merged.items, [entity("a", 8, { purchased: true }), entity("b", 4)]);
  assert.deepEqual(mergeLists([renamed], [{ id: "M", name: "Другой", updatedAt: 1, items: [] }]).map((list) => list.id), ["L", "M"]);
});

test("profile settings follow the later change", () => {
  const empty = { stores: [], templates: [], recipes: [], categories: [] };
  const merged = mergeProfile({ ...empty, settings: { darkMode: true, updatedAt: 5 } }, { ...empty, settings: { darkMode: false, updatedAt: 3 }, recipes: [entity("r", 1)] });
  assert.equal(merged.settings.darkMode, true);
  assert.deepEqual(merged.recipes, [entity("r", 1)]);
});
