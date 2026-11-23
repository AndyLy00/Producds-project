// Reads products from a Linella category page (linella.md runs CS-Cart with the "abt__unitheme2"
// theme). Every product is a "ut2-gl__item" card:
//   <a class="product-title" href="…">Name</a>
//   <span class="ty-price-num" id="sec_discounted_price_50449">64<sup>99</sup></span>   -> 64.99 lei
//   <span class="ty-list-price ty-nowrap" id="sec_list_price_50449">217<sup>99</sup></span>  (old price)
//   <span id="line_discount_value_50449">-26%</span>
//   <span class="wp-price-per-kg">364,99 lei за кг</span>, <span class="wp-step-label">за 500 г</span>  (by weight)
// Prices are returned in bani (1 leu = 100 bani), like the rest of the app's prices.
// No HTML library: the cards are regular enough for a few patterns, and the bot stays free of
// dependencies. tests/linella-parse.test.mjs pins the patterns down.

const CARD = /class="[^"]*\but2-gl__item\b[^"]*"/g;

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decode(text) {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code) => {
      if (code[0] === "#") return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
      return entities[code.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const stripTags = (html) => decode(html.replace(/<[^>]*>/g, " "));

// "64<sup>99</sup>" or "1 234<sup>50</sup>" -> 6499 / 123450.
function priceAfter(html, idPrefix) {
  const match = new RegExp(`id="${idPrefix}\\d+"[^>]*>\\s*([\\d\\s\\u00a0.,]+?)\\s*<sup>\\s*(\\d{1,2})\\s*</sup>`).exec(html);
  if (!match) return undefined;
  const lei = Number(match[1].replace(/[^\d]/g, ""));
  const bani = Number(match[2].padEnd(2, "0"));
  return Number.isFinite(lei) ? lei * 100 + bani : undefined;
}

// "364,99 lei за кг" -> 36499.
function perKg(html) {
  const match = /class="[^"]*\bwp-price-per-kg\b[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(html);
  if (!match) return undefined;
  const number = /(\d[\d\s ]*)(?:[.,](\d{1,2}))?/.exec(stripTags(match[1]));
  return number ? Number(number[1].replace(/[^\d]/g, "")) * 100 + Number((number[2] ?? "0").padEnd(2, "0")) : undefined;
}

function classText(html, className) {
  const match = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</`).exec(html);
  return match ? stripTags(match[1]) : undefined;
}

export function parseCards(html, pageUrl) {
  const starts = [...html.matchAll(CARD)].map((match) => match.index);
  const products = [];
  for (let index = 0; index < starts.length; index += 1) {
    const card = html.slice(starts[index], starts[index + 1] ?? html.length);
    const id = /id="(?:sec_discounted_price|price_update)_(\d+)"/.exec(card)?.[1];
    const anchor = /<a\b[^>]*class="[^"]*\bproduct-title\b[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(card);
    const price = priceAfter(card, "sec_discounted_price_");
    if (!id || !anchor || price === undefined) continue;
    const href = /href="([^"]+)"/.exec(anchor[0])?.[1];
    const listPrice = priceAfter(card, "sec_list_price_");
    const discount = /id="line_discount_value_\d+"[^>]*>\s*-?(\d+)\s*%/.exec(card)?.[1];
    const kg = perKg(card);
    // Products sold by weight show the price of one step ("за 500 г") but the old price per kg.
    const oldPerKg = Boolean(kg) && /\bkg\b|кг/i.test(classText(card, "wp-old-price-unit") ?? "");
    products.push({
      id,
      name: stripTags(anchor[1]),
      url: href ? new URL(decode(href), pageUrl).href : undefined,
      price,
      ...(listPrice && !oldPerKg && listPrice > price ? { oldPrice: listPrice } : {}),
      ...(discount ? { discount: Number(discount) } : {}),
      ...(kg ? { perKg: kg, step: classText(card, "wp-step-label") } : {}),
      ...(oldPerKg && listPrice > kg ? { oldPerKg: listPrice } : {}),
      inStock: !/out-of-stock|Нет в наличии|Stoc epuizat/i.test(card),
    });
  }
  return products;
}

// Address prefix of a language: Romanian is the site's main language and has none.
export const languagePrefix = (language) => (language === "ro" ? "" : `/${language}`);

// Top-level categories linked from the home page (https://linella.md/ru/<slug>/ or
// https://linella.md/<slug>/). Only sections with subsections count, which leaves out pages such
// as contacts or vacancies.
export function parseCategories(html, language) {
  const prefix = languagePrefix(language).replace(/\//g, "\\/");
  const links = [...html.matchAll(new RegExp(`href="(?:https://linella\\.md)?${prefix}/([a-z0-9-]+)/([a-z0-9-]+/)?"`, "g"))];
  const withChildren = new Set(links.filter((match) => match[2]).map((match) => match[1]));
  return [...new Set(links.map((match) => match[1]))].filter((slug) => withChildren.has(slug) && !/^(ru|ro|en|page-\d+)$/.test(slug));
}

// The highest page number linked from a category's pagination (…/page-7/).
export function lastPage(html) {
  return Math.max(1, ...[...html.matchAll(/\/page-(\d+)\/"/g)].map((match) => Number(match[1])));
}

// Cloudflare's "Just a moment…" check instead of the page: the bot must not try to get past it.
export function isChallenge(status, html) {
  return status === 403 || status === 503 ? /Just a moment|challenge-platform|cf-chl/i.test(html) : false;
}
