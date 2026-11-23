// Accepts only the known fields of what the app sends, with type checks and size caps, so that
// the database never stores arbitrary client data. Shapes: src/model.ts.
import { dropOldTombstones } from "../shared/merge.js";

const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");
const time = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 100;
// Photo ids are random and made by the app (src/photos.ts), so a photo can be referenced before
// it is uploaded.
export const validPhotoId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(value);
const tombstone = (entity) => (entity.deleted === true ? { deleted: true } : {});

// The newest copy of an entity wins a merge, so a change stamped far in the future (a phone with
// a wrong clock, or someone sharing a list on purpose) would win against every later edit.
// Stamps may run ahead of the server's clock only by this much.
export const MAX_CLOCK_AHEAD = 5 * 60 * 1000;
const stamp = (value) => Math.min(time(value), Date.now() + MAX_CLOCK_AHEAD);

function many(values, max, clean) {
  return Array.isArray(values) ? values.filter((value) => value && typeof value === "object").slice(0, max).map(clean) : [];
}

// Up to `max` live entities plus up to `max` recent tombstones: removals can never push live
// entities out, and tombstones older than TOMBSTONE_LIFETIME are dropped.
function entities(values, max, clean) {
  if (!Array.isArray(values)) return [];
  const valid = values.filter((value) => value && typeof value === "object" && validId(value.id));
  const live = valid.filter((value) => value.deleted !== true).slice(0, max).map(clean);
  const removed = dropOldTombstones(valid.filter((value) => value.deleted === true).map(clean))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, max);
  return [...live, ...removed];
}

function product(value) {
  return {
    name: text(value.name, 200),
    quantity: text(value.quantity, 20),
    unit: text(value.unit, 20),
    category: text(value.category, 60),
    note: text(value.note, 300),
  };
}

export function cleanItem(value) {
  return {
    id: value.id,
    ...product(value),
    purchased: value.purchased === true,
    favorite: value.favorite === true,
    order: Number.isFinite(value.order) ? value.order : 0,
    updatedAt: stamp(value.updatedAt),
    ...tombstone(value),
  };
}

export function cleanList(value) {
  if (!value || typeof value !== "object" || !validId(value.id)) return null;
  return {
    id: value.id,
    name: text(value.name, 120),
    createdAt: time(value.createdAt),
    updatedAt: stamp(value.updatedAt),
    ...(value.completedAt ? { completedAt: time(value.completedAt) } : {}),
    ...(validId(value.storeId) ? { storeId: value.storeId } : {}),
    sortMode: value.sortMode === "manual" ? "manual" : "category",
    ...(value.remindAt ? { remindAt: time(value.remindAt) } : {}),
    ...tombstone(value),
    items: entities(value.items, 1000, cleanItem),
  };
}

export function cleanProfile(value) {
  if (!value || typeof value !== "object") return null;
  const settings = value.settings && typeof value.settings === "object" ? value.settings : {};
  return {
    stores: entities(value.stores, 50, (store) => ({
      id: store.id,
      name: text(store.name, 80),
      categoryOrder: many(store.categoryOrder, 60, (name) => name).filter((name) => typeof name === "string").map((name) => name.slice(0, 60)),
      updatedAt: stamp(store.updatedAt),
      ...tombstone(store),
    })),
    templates: entities(value.templates, 100, (template) => ({
      id: template.id,
      name: text(template.name, 120),
      items: many(template.items, 300, product),
      updatedAt: stamp(template.updatedAt),
      ...tombstone(template),
    })),
    recipes: entities(value.recipes, 300, (recipe) => ({
      id: recipe.id,
      name: text(recipe.name, 120),
      note: text(recipe.note, 5000),
      ingredients: many(recipe.ingredients, 100, product),
      steps: many(recipe.steps, 60, (step) => ({
        id: validId(step.id) ? step.id : "",
        text: text(step.text, 1000),
        ...(Number.isFinite(step.minutes) && step.minutes > 0 ? { minutes: Math.min(Math.round(step.minutes), 24 * 60) } : {}),
      })).filter((step) => step.id),
      ...(validPhotoId(recipe.photo) ? { photo: recipe.photo } : {}),
      updatedAt: stamp(recipe.updatedAt),
      ...tombstone(recipe),
    })),
    categories: entities(value.categories, 60, (category) => ({
      id: category.id,
      name: text(category.name, 60),
      updatedAt: stamp(category.updatedAt),
      ...tombstone(category),
    })),
    settings: { darkMode: settings.darkMode === true, updatedAt: stamp(settings.updatedAt) },
  };
}

export const emptyProfile = () => ({ stores: [], templates: [], recipes: [], categories: [], settings: { darkMode: false, updatedAt: 0 } });
