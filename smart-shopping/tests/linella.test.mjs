// The Linella price bot (scripts/linella/): reading pages, walking the catalogue, saving prices.
// The cards below copy the structure of linella.md's category pages as of November 2026.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { BlockedError, crawlLanguage, mergeLanguages, pageFetcher, savePrices, USER_AGENT } from "../scripts/linella/crawl.mjs";
import { isChallenge, lastPage, parseCards, parseCategories } from "../scripts/linella/parse.mjs";

const card = ({ id, name, href, lei, bani, list, listUnit, discount, perKg, step, outOfStock }) => `
<div class="ut2-gl__item js-product" data-ca-min-qty="1">
  <a class="product_icon_lnk" href="${href}"><img id="det_img_${id}desktop" src="/images/x.webp"></a>
  <div class="ut2-gl__name"><a href="${href}" class="product-title" title="${name}">${name}</a></div>
  ${outOfStock ? '<span class="ty-qty-out-of-stock">Нет в наличии</span>' : `<span id="in_stock_info_${id}">В наличии</span>`}
  <div class="ut2-gl__price pr-col-rev-mix">
    <span class="cm-reload-${id} ty-price-update" id="price_update_${id}"><input type="hidden" name="appearance[show_price_values]" value="1">
      <span class="ty-price" id="line_discounted_price_${id}"><bdi><span id="sec_discounted_price_${id}" class="ty-price-num">${lei}<sup>${bani}</sup></span><span class="ty-price-num"><sup>lei</sup></span></bdi></span>
    </span>
    ${list ? `<span class="cm-reload-${id}" id="old_price_update_${id}"><span class="ty-list-price" id="line_list_price_${id}"><span class="ty-strike"><bdi><span id="sec_list_price_${id}" class="ty-list-price ty-nowrap">${list[0]}<sup>${list[1]}</sup></span><span class="ty-list-price ty-nowrap"><sup>lei</sup></span></bdi></span></span>${listUnit ? `<span class="wp-old-price-unit">${listUnit}</span>` : ""}</span>` : ""}
    ${discount ? `<span class="ut2-sld-short cm-reload-${id}" id="line_discount_update_${id}"><span class="ty-list-price ty-save-price" id="line_discount_value_${id}">-${discount}%</span></span>` : ""}
    ${perKg ? `<span class="wp-step-label">${step}</span><div class="wp-product-pricing"><span class="wp-weight-badge">Весовой товар</span><span class="wp-price-per-kg">${perKg} lei за кг</span></div>` : ""}
  </div>
  <form action="https://linella.md/" method="post"><input type="hidden" name="security_hash" value="abc"></form>
</div>`;

const page = (products, pages = []) => `<html><body><div class="grid-list">${products.map(card).join("")}</div>
<div class="ty-pagination">${pages.map((n) => `<a href="https://linella.md/ru/molochnye-produkty-i-yayca/page-${n}/">${n}</a>`).join("")}</div></body></html>`;

const milk = { id: "100", name: "Молоко 3.5% 930мл CASUTA MEA", href: "https://linella.md/ru/molochnye-produkty-i-yayca/moloko/moloko-3-5/", lei: "23", bani: "99" };
const yogurt = { id: "101", name: "Йогурт &quot;Персик&quot; 1.5% 250г", href: "/ru/molochnye-produkty-i-yayca/yogurty/persik/", lei: "18", bani: "99", list: ["22", "99"], discount: 17 };
const salami = { id: "102", name: "Сыр Салями 45%, кг LATTI", href: "/ru/molochnye-produkty-i-yayca/syr/salyami/", lei: "80", bani: "00", list: ["217", "99"], listUnit: "за кг", discount: 26, perKg: "159,99", step: "за 500 г" };
const gone = { id: "103", name: "Кефир 1л", href: "/ru/molochnye-produkty-i-yayca/kefir/", lei: "1 234", bani: "5", outOfStock: true };

test("cards give names, addresses and prices in bani", () => {
  const products = parseCards(page([milk, yogurt, salami, gone]), "https://linella.md/ru/molochnye-produkty-i-yayca/");
  assert.deepEqual(products, [
    { id: "100", name: "Молоко 3.5% 930мл CASUTA MEA", url: milk.href, price: 2399, inStock: true },
    { id: "101", name: 'Йогурт "Персик" 1.5% 250г', url: "https://linella.md/ru/molochnye-produkty-i-yayca/yogurty/persik/", price: 1899, oldPrice: 2299, discount: 17, inStock: true },
    // Sold by weight: the price is for one 500 g step, the old price is per kg.
    { id: "102", name: "Сыр Салями 45%, кг LATTI", url: "https://linella.md/ru/molochnye-produkty-i-yayca/syr/salyami/", price: 8000, discount: 26, perKg: 15999, step: "за 500 г", oldPerKg: 21799, inStock: true },
    { id: "103", name: "Кефир 1л", url: "https://linella.md/ru/molochnye-produkty-i-yayca/kefir/", price: 123450, inStock: false },
  ]);
});

test("categories, pages and Cloudflare's check are recognised", () => {
  const home = `<a href="https://linella.md/ru/kontakty/">Контакты</a><a href="https://linella.md/ru/bakaleya/">Бакалея</a><a href="https://linella.md/ru/bakaleya/krupy/">Крупы</a>
    <a href="/ru/napitki/">Напитки</a><a href="/ru/napitki/voda/">Вода</a><a href="https://linella.md/ru/products-search/">x</a>`;
  assert.deepEqual(parseCategories(home, "ru"), ["bakaleya", "napitki"]);
  const roHome = `<a href="https://linella.md/lactate/">Lactate</a><a href="https://linella.md/lactate/lapte/">Lapte</a><a href="https://linella.md/ru/bakaleya/krupy/">x</a><a href="https://linella.md/contacte/">x</a>`;
  assert.deepEqual(parseCategories(roHome, "ro"), ["lactate"]);
  assert.equal(lastPage(page([milk], [2, 3, 9])), 9);
  assert.equal(lastPage(page([milk])), 1);
  assert.equal(isChallenge(403, "<title>Just a moment...</title>"), true);
  assert.equal(isChallenge(200, "<title>Just a moment...</title>"), false);
  assert.equal(isChallenge(403, "Forbidden"), false);
});

test("the crawl walks every page of every category once and merges both languages", async () => {
  const site = {
    "/ru/": '<a href="/ru/moloko/">x</a><a href="/ru/moloko/kefir/">x</a><a href="/ru/syr/">x</a><a href="/ru/syr/brynza/">x</a>',
    "/ru/moloko/": page([milk, yogurt], [2]),
    "/ru/moloko/page-2/": page([gone], [2, 3]),
    // page-3 is linked but missing: the crawl stops there.
    "/ru/syr/": page([salami, milk]),
    "/": '<a href="/lactate/">x</a><a href="/lactate/lapte/">x</a>',
    "/lactate/": page([{ ...milk, name: "Lapte 3.5% 930ml CASUTA MEA", href: "/lactate/lapte-3-5/" }, { ...salami, name: "Cașcaval Salami 45%, kg LATTI" }]),
  };
  const asked = [];
  const fetchPage = async (path) => { asked.push(path); return site[path] ?? null; };
  const ru = await crawlLanguage(fetchPage, "ru", { log: () => undefined });
  assert.deepEqual([...ru.products.keys()], ["100", "101", "103", "102"]);
  assert.equal(ru.products.get("100").category, "moloko");
  assert.deepEqual(asked, ["/ru/", "/ru/moloko/", "/ru/moloko/page-2/", "/ru/moloko/page-3/", "/ru/syr/"]);
  const ro = await crawlLanguage(fetchPage, "ro", { log: () => undefined });
  const merged = mergeLanguages(ru.products, ro.products);
  assert.deepEqual(merged.get("100").name, { ru: "Молоко 3.5% 930мл CASUTA MEA", ro: "Lapte 3.5% 930ml CASUTA MEA" });
  assert.equal(merged.get("100").url.ro, "https://linella.md/lactate/lapte-3-5/");
  assert.equal(merged.get("102").perKg, 15999);
  assert.equal(merged.size, 4);
});

test("the bot introduces itself, retries an overloaded site and stops at Cloudflare", async () => {
  const seen = [];
  let busy = 1;
  const server = createServer((request, response) => {
    seen.push({ path: request.url, agent: request.headers["user-agent"], key: request.headers["x-korzina-bot"] });
    if (request.url === "/busy/" && busy-- > 0) return response.writeHead(503).end("busy");
    if (request.url === "/blocked/") return response.writeHead(403).end("<title>Just a moment...</title>");
    if (request.url === "/missing/") return response.writeHead(404).end("no");
    response.writeHead(200, { "Content-Type": "text/html" }).end("ok");
  }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const fetchPage = pageFetcher({ base, key: "secret", delay: 1, log: () => undefined });
    assert.equal(await fetchPage("/ru/"), "ok");
    assert.equal(await fetchPage("/busy/"), "ok");
    assert.equal(await fetchPage("/missing/"), null);
    await assert.rejects(fetchPage("/blocked/"), BlockedError);
    assert.equal(seen.filter((entry) => entry.path === "/blocked/").length, 1, "never retried");
    assert.ok(seen.every((entry) => entry.agent === USER_AGENT && entry.key === "secret"));
  } finally {
    server.close();
  }
});

const skip = process.env.MONGODB_URI ? false : "MONGODB_URI is not set";

test("prices are saved with their history; a broken crawl changes nothing", { skip }, async () => {
  const { MongoClient } = await import("mongodb");
  const client = await new MongoClient(process.env.MONGODB_URI).connect();
  const db = client.db(`korzina-prices-${Date.now()}`);
  const quiet = { log: () => undefined };
  const product = (id, price, extra = {}) => [id, { id, name: { ru: `Товар ${id}`, ro: `Produs ${id}` }, url: { ru: `/ru/${id}/`, ro: `/${id}/` }, price, inStock: true, category: "x", ...extra }];
  try {
    const first = new Date(Date.now() - 1000);
    await savePrices(db, new Map([product("1", 1000), product("2", 2000), product("3", 3000)]), { startedAt: first, pages: 1, ...quiet });
    const second = new Date();
    await savePrices(db, new Map([product("1", 900, { oldPrice: 1000, discount: 10 }), product("2", 2000)]), { startedAt: second, pages: 1, ...quiet });
    const saved = Object.fromEntries((await db.collection("prices").find().toArray()).map((doc) => [doc._id, doc]));
    assert.equal(saved["linella:1"].price, 900);
    assert.deepEqual(saved["linella:1"].history.map((entry) => entry.price), [1000, 900]);
    assert.equal(saved["linella:2"].history.length, 1, "an unchanged price adds no history");
    assert.equal(saved["linella:3"].available, false);
    assert.equal(saved["linella:1"].search, "товар 1 produs 1");

    // Far fewer products than last time: the site changed; keep what we have.
    await assert.rejects(savePrices(db, new Map(), { startedAt: new Date(), pages: 1, ...quiet }), /nothing saved/);
    assert.equal((await db.collection("prices").findOne({ _id: "linella:1" })).price, 900);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
