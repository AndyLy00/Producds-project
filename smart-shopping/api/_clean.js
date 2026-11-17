// Accepts only the known fields of what the app sends, with type checks and size caps, so that
// the database never stores arbitrary client data. Shapes: src/model.ts.

const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");
const time = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 100;
const tombstone = (entity) => (entity.deleted === true ? { deleted: true } : {});

function many(values, max, clean) {
  return Array.isArray(values) ? values.filter((value) => value && typeof value === "object").slice(0, max).map(clean) : [];
}

function entities(values, max, clean) {
  return many(values, max, (value) => value).filter((value) => validId(value.id)).map(clean);
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
    updatedAt: time(value.updatedAt),
    ...tombstone(value),
  };
}

export function cleanList(value) {
  if (!value || typeof value !== "object" || !validId(value.id)) return null;
  return {
    id: value.id,
    name: text(value.name, 120),
    createdAt: time(value.createdAt),
    updatedAt: time(value.updatedAt),
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
      updatedAt: time(store.updatedAt),
      ...tombstone(store),
    })),
    templates: entities(value.templates, 100, (template) => ({
      id: template.id,
      name: text(template.name, 120),
      items: many(template.items, 300, product),
      updatedAt: time(template.updatedAt),
      ...tombstone(template),
    })),
    recipes: entities(value.recipes, 300, (recipe) => ({
      id: recipe.id,
      name: text(recipe.name, 120),
      note: text(recipe.note, 2000),
      ingredients: many(recipe.ingredients, 100, product),
      updatedAt: time(recipe.updatedAt),
      ...tombstone(recipe),
    })),
    categories: entities(value.categories, 60, (category) => ({
      id: category.id,
      name: text(category.name, 60),
      updatedAt: time(category.updatedAt),
      ...tombstone(category),
    })),
    settings: { darkMode: settings.darkMode === true, updatedAt: time(settings.updatedAt) },
  };
}

export const emptyProfile = () => ({ stores: [], templates: [], recipes: [], categories: [], settings: { darkMode: false, updatedAt: 0 } });
