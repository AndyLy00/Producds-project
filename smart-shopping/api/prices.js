// Shop prices for the products of a shopping list. The prices come from Linella's catalogue,
// collected with Linella's permission by scripts/linella/crawl.mjs every two weeks.
//
//   POST /api/prices { names: ["Молоко", "Pâine", …] }
//     -> { store, updatedAt, prices: { "Молоко": { price, perKg?, step?, name, url, matches } | null } }
//
// A list item is a name like "Молоко", not a particular product, so the answer is an estimate:
// among the products whose names fit best, the one with the median price (not the cheapest: a
// half-litre carton should not stand for "milk").
import { HttpError, clientAddress, database, json, preflight, readJson, route, takeAttempt } from "./_lib.js";

const MAX_NAMES = 100;
const CANDIDATES = 150;
const SAMPLE = 7;
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const normalize = (text) => text.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[^\p{L}\p{N}%.,]+/gu, " ").trim();
const cyrillic = /[а-яё]/i;

export function rank(query, documents) {
  const tokens = normalize(query).split(" ").filter((token) => token.length >= 2).slice(0, 4);
  const language = cyrillic.test(query) ? "ru" : "ro";
  return documents
    .map((document) => {
      const name = normalize(document.name?.[language] ?? document.name?.ru ?? document.name?.ro ?? "");
      let score = name.startsWith(tokens[0] ?? "\u0000") ? 3 : 0;
      for (const token of tokens) if (new RegExp(`(^|[^\\p{L}\\p{N}])${escape(token)}`, "u").test(name)) score += 1;
      if (document.inStock === false) score -= 1;
      return { document, score, language };
    })
    .filter((entry) => entry.score > 0);
}

// The product with the median price among the best-fitting ones.
export function estimate(query, documents) {
  const ranked = rank(query, documents);
  if (ranked.length === 0) return null;
  const best = Math.max(...ranked.map((entry) => entry.score));
  const top = ranked.filter((entry) => entry.score === best).sort((a, b) => b.document.inStock - a.document.inStock || a.document.price - b.document.price).slice(0, SAMPLE);
  top.sort((a, b) => a.document.price - b.document.price);
  const { document, language } = top[Math.floor((top.length - 1) / 2)];
  return {
    price: document.price,
    ...(document.perKg ? { perKg: document.perKg, step: document.step } : {}),
    ...(document.oldPrice ? { oldPrice: document.oldPrice } : {}),
    name: document.name?.[language] ?? document.name?.ru,
    url: document.url?.[language] ?? document.url?.ru,
    matches: ranked.length,
  };
}

async function find(prices, name, run) {
  // A new crawl makes every cached answer stale.
  const key = `${run}:${normalize(name)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const tokens = normalize(name).split(" ").filter((token) => token.length >= 2).slice(0, 4);
  let value = null;
  if (tokens.length) {
    const projection = { name: 1, url: 1, price: 1, oldPrice: 1, perKg: 1, step: 1, inStock: 1 };
    const query = (words) => prices.find({ store: "linella", available: true, $and: words.map((word) => ({ search: { $regex: escape(word) } })) }, { projection }).limit(CANDIDATES).toArray();
    let documents = await query(tokens);
    // "Молоко домашнее свежее": fall back to the first word when all of them match nothing.
    if (documents.length === 0 && tokens.length > 1) documents = await query(tokens.slice(0, 1));
    value = estimate(name, documents);
  }
  cache.set(key, { value, at: Date.now() });
  return value;
}

export const OPTIONS = preflight;

export const POST = route(async (request) => {
  await takeAttempt(`prices:ip:${clientAddress(request)}`, 120, 60);
  const body = await readJson(request, 20_000);
  if (!Array.isArray(body.names)) throw new HttpError(400, "Некорректный запрос.");
  const names = [...new Set(body.names.filter((name) => typeof name === "string" && name.trim()).map((name) => name.trim().slice(0, 120)))].slice(0, MAX_NAMES);
  const db = await database();
  const run = await db.collection("priceRuns").findOne({ store: "linella", ok: true }, { sort: { finishedAt: -1 }, projection: { finishedAt: 1 } });
  if (!run) return json(200, { store: "linella", updatedAt: null, prices: {} });
  const prices = db.collection("prices");
  const found = await Promise.all(names.map((name) => find(prices, name, run.finishedAt.getTime())));
  return json(200, { store: "linella", updatedAt: run.finishedAt, prices: Object.fromEntries(names.map((name, index) => [name, found[index]])) });
});
