// Merging of two copies of the app's data, used by both the app (src/) and the server (api/).
//
// Everything that syncs is an "entity": an object with an `id` and an `updatedAt` timestamp set
// by the device that last changed it. A removed entity stays as a tombstone
// `{ id, updatedAt, deleted: true }` so that the removal reaches the other copies. Merging keeps,
// for every id, the copy changed last. A list is an entity whose `items` are entities too, so
// two devices editing different products of one list both keep their changes.

function newer(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  if (Boolean(a.deleted) !== Boolean(b.deleted)) return a.deleted ? a : b;
  // Same timestamp, different content: any rule works as long as every copy applies the same one.
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

export function mergeEntities(mine = [], theirs = []) {
  const merged = new Map(mine.map((entity) => [entity.id, entity]));
  for (const entity of theirs) {
    const existing = merged.get(entity.id);
    merged.set(entity.id, existing ? newer(existing, entity) : entity);
  }
  return [...merged.values()];
}

export function mergeList(mine, theirs) {
  const winner = newer({ ...mine, items: undefined }, { ...theirs, items: undefined });
  return { ...winner, items: mergeEntities(mine.items, theirs.items) };
}

export function mergeLists(mine = [], theirs = []) {
  const merged = new Map(mine.map((list) => [list.id, list]));
  for (const list of theirs) {
    const existing = merged.get(list.id);
    merged.set(list.id, existing ? mergeList(existing, list) : list);
  }
  return [...merged.values()];
}

// The part of the data that belongs to one account rather than to a (possibly shared) list.
export function mergeProfile(mine, theirs) {
  return {
    stores: mergeEntities(mine.stores, theirs.stores),
    templates: mergeEntities(mine.templates, theirs.templates),
    recipes: mergeEntities(mine.recipes, theirs.recipes),
    categories: mergeEntities(mine.categories, theirs.categories),
    settings: (theirs.settings?.updatedAt ?? 0) > (mine.settings?.updatedAt ?? 0) ? theirs.settings : mine.settings,
  };
}
