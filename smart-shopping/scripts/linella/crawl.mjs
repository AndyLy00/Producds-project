// Collects every price in Linella's online catalogue, with Linella's permission, and stores it in
// the app's database (collection "prices"), where api/prices.js finds them for shopping lists.
// Runs every two weeks from .github/workflows/linella-prices.yml; by hand:
//
//   MONGODB_URI=… node scripts/linella/crawl.mjs             crawl and save
//   PRICE_BOT_DRY_RUN=1 PRICE_BOT_LIMIT=2 node scripts/…     two categories, print, save nothing
//
// Manners: it says who it is (User-Agent), reads only catalogue pages that robots.txt allows (no
// search, no query strings), one page at a time with a pause in between, and gives up instead of
// trying to get past Cloudflare: if Linella's protection stops it, Linella has to let the bot in
// (see README, "Цены Linella").
import { pathToFileURL } from "node:url";
import { isChallenge, lastPage, languagePrefix, parseCards, parseCategories } from "./parse.mjs";

export const BASE = "https://linella.md";
export const USER_AGENT = "KorzinaPriceBot/1.0 (+https://korzina-peach.vercel.app/privacy)";
const LANGUAGES = ["ru", "ro"];
const MAX_PAGES = 400;

export class BlockedError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetches a page as the bot: identifies itself and, when Linella gave one, sends the key its
// Cloudflare rule lets through. Retries a few times on overload; never on a Cloudflare check.
export function pageFetcher({ base = BASE, key = process.env.LINELLA_BOT_KEY, delay = 2000, log = console.log } = {}) {
  let last = 0;
  return async function fetchPage(path) {
    for (let attempt = 1; ; attempt += 1) {
      const wait = last + delay - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const response = await fetch(base + path, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html",
          "Accept-Language": path.startsWith("/ru/") ? "ru" : "ro",
          ...(key ? { "X-Korzina-Bot": key } : {}),
        },
        redirect: "follow",
      });
      const html = await response.text();
      if (isChallenge(response.status, html)) throw new BlockedError(`Cloudflare stopped the bot at ${path} (HTTP ${response.status}). Linella has to let it in.`);
      if (response.status === 404) return null;
      if (response.ok) return html;
      if (attempt >= 4 || (response.status < 500 && response.status !== 429)) throw new Error(`HTTP ${response.status} for ${path}`);
      log(`HTTP ${response.status} for ${path}, waiting before retry ${attempt}`);
      await sleep(delay * 5 * attempt);
    }
  };
}

// Every product of one language: { id -> product with name, url, price, … and category }.
export async function crawlLanguage(fetchPage, language, { limit = Infinity, log = console.log } = {}) {
  const prefix = languagePrefix(language);
  const home = await fetchPage(`${prefix}/`);
  if (!home) throw new Error(`No home page for ${language}`);
  const categories = parseCategories(home, language).slice(0, limit);
  if (categories.length === 0) throw new Error(`No categories found on the ${language} home page`);
  const products = new Map();
  let pages = 0;
  for (const category of categories) {
    let known = 1;
    for (let page = 1; page <= Math.min(known, MAX_PAGES); page += 1) {
      const html = await fetchPage(page === 1 ? `${prefix}/${category}/` : `${prefix}/${category}/page-${page}/`);
      if (!html) break;
      pages += 1;
      known = Math.max(known, lastPage(html));
      const found = parseCards(html, BASE);
      if (found.length === 0) break;
      for (const product of found) if (!products.has(product.id)) products.set(product.id, { ...product, category });
    }
    log(`${language} ${category}: ${products.size} products so far, ${pages} pages`);
  }
  return { products, pages, categories: categories.length };
}

// Joins the Russian and Romanian copies of each product into the stored shape.
export function mergeLanguages(ru, ro) {
  const merged = new Map();
  for (const [language, products] of [["ru", ru], ["ro", ro]]) {
    for (const [id, product] of products) {
      const entry = merged.get(id) ?? { id, name: {}, url: {} };
      entry.name[language] = product.name;
      entry.url[language] = product.url;
      // Prices are the same in both languages; the Russian copy is read first.
      for (const field of ["price", "oldPrice", "discount", "perKg", "oldPerKg", "step", "inStock", "category"]) {
        if (entry[field] === undefined && product[field] !== undefined) entry[field] = product[field];
      }
      merged.set(id, entry);
    }
  }
  return merged;
}

const normalize = (text) => text.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();

// Saves a crawl. Refuses one that found far fewer products than the last good one: that means
// the site changed, and old prices are better than none.
export async function savePrices(db, merged, { startedAt, pages, minShare = 0.5, log = console.log }) {
  const prices = db.collection("prices");
  const runs = db.collection("priceRuns");
  await prices.createIndex({ store: 1, seenAt: 1 });
  const previous = await runs.findOne({ store: "linella", ok: true }, { sort: { finishedAt: -1 } });
  if (previous && merged.size < previous.products * minShare) {
    await runs.insertOne({ store: "linella", ok: false, startedAt, finishedAt: new Date(), products: merged.size, pages, reason: "too few products" });
    throw new Error(`Only ${merged.size} products found, the last run had ${previous.products}: nothing saved.`);
  }
  const before = new Map((await prices.find({ store: "linella" }, { projection: { price: 1 } }).toArray()).map((doc) => [doc._id, doc.price]));
  const operations = [...merged.values()].map((product) => {
    const _id = `linella:${product.id}`;
    const changed = before.get(_id) !== product.price;
    const fields = {
      store: "linella",
      productId: product.id,
      name: product.name,
      url: product.url,
      search: normalize(`${product.name.ru ?? ""} ${product.name.ro ?? ""}`),
      price: product.price,
      oldPrice: product.oldPrice ?? null,
      discount: product.discount ?? null,
      perKg: product.perKg ?? null,
      oldPerKg: product.oldPerKg ?? null,
      step: product.step ?? null,
      category: product.category,
      inStock: product.inStock !== false,
      available: true,
      seenAt: startedAt,
    };
    return {
      updateOne: {
        filter: { _id },
        update: {
          $set: changed ? { ...fields, priceChangedAt: startedAt } : fields,
          ...(changed ? { $push: { history: { $each: [{ price: product.price, at: startedAt }], $slice: -26 } } } : {}),
        },
        upsert: true,
      },
    };
  });
  for (let index = 0; index < operations.length; index += 1000) await prices.bulkWrite(operations.slice(index, index + 1000), { ordered: false });
  // Products the shop no longer lists stay for their history, marked as gone.
  const gone = await prices.updateMany({ store: "linella", seenAt: { $lt: startedAt } }, { $set: { available: false } });
  await runs.insertOne({ store: "linella", ok: true, startedAt, finishedAt: new Date(), products: merged.size, pages });
  log(`Saved ${merged.size} products (${[...merged.values()].filter((product) => before.get(`linella:${product.id}`) !== product.price).length} new or changed prices, ${gone.modifiedCount} gone).`);
}

async function main() {
  const dryRun = Boolean(process.env.PRICE_BOT_DRY_RUN);
  const limit = Number(process.env.PRICE_BOT_LIMIT) || Infinity;
  const fetchPage = pageFetcher({ delay: Number(process.env.PRICE_BOT_DELAY_MS) || 2000 });
  const startedAt = new Date();
  const results = {};
  for (const language of LANGUAGES) results[language] = await crawlLanguage(fetchPage, language, { limit });
  const merged = mergeLanguages(results.ru.products, results.ro.products);
  const pages = results.ru.pages + results.ro.pages;
  console.log(`Found ${merged.size} products on ${pages} pages in ${Math.round((Date.now() - startedAt) / 60000)} min.`);
  if (dryRun) {
    console.log(JSON.stringify([...merged.values()].slice(0, 5), null, 2));
    return;
  }
  const { MongoClient } = await import("mongodb");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  const client = await new MongoClient(process.env.MONGODB_URI).connect();
  try {
    await savePrices(client.db(process.env.MONGODB_DB || "korzina"), merged, { startedAt, pages });
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof BlockedError ? `BLOCKED: ${error.message}` : error);
    process.exit(1);
  });
}
