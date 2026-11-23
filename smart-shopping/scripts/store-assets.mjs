// Images for the Google Play listing (store/play/): the 1024×500 feature graphic and phone
// screenshots (1080×2160) in Russian, English and Romanian, taken from the built app with its demo
// data. Run after `npm run build:web`:
//
//   node scripts/store-assets.mjs
import { createServer } from "node:http";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const site = join(root, "dist/web");
const out = join(root, "store/play");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp" };

const texts = {
  ru: { title: "Корзина", tagline: "Списки покупок, рецепты\nи таймеры — вместе с семьёй" },
  en: { title: "Korzina", tagline: "Shopping lists, recipes\nand timers — with your family" },
  ro: { title: "Korzina", tagline: "Liste de cumpărături, rețete\nși cronometre — cu familia" },
};

const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://x").pathname;
  try {
    response.writeHead(200, { "Content-Type": types[extname(path)] ?? "text/html" }).end(await readFile(join(site, path === "/" ? "index.html" : path)));
  } catch {
    response.writeHead(404).end();
  }
}).listen(4395);

const browser = await chromium.launch();
await mkdir(out, { recursive: true });
await copyFile(join(root, "assets/logo.png"), join(out, "icon-512.png"));
const logo = `data:image/png;base64,${(await readFile(join(root, "assets/logo.png"))).toString("base64")}`;

for (const [lang, text] of Object.entries(texts)) {
  await mkdir(join(out, lang), { recursive: true });

  // Feature graphic.
  const banner = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await banner.setContent(`<!doctype html><html><body style="margin:0;width:1024px;height:500px;display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box;background:linear-gradient(135deg,#faf7ee 0%,#f1ead8 100%);font-family:system-ui,'Segoe UI',Roboto,sans-serif;color:#203f2b">
    <img src="${logo}" style="width:330px;height:330px;border-radius:64px;box-shadow:0 18px 50px #2f603c33">
    <div><div style="font-size:84px;font-weight:800;letter-spacing:-1px">${text.title}</div>
    <div style="margin-top:18px;font-size:36px;line-height:1.3;font-weight:600;color:#2f603c;white-space:pre-line">${text.tagline}</div></div>
  </body></html>`);
  await banner.screenshot({ path: join(out, lang, "feature-graphic.png") });
  await banner.close();

  // Screenshots: 360×720 at 3× = 1080×2160 (Play accepts at most 2:1).
  const context = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, locale: { ru: "ru-RU", en: "en-GB", ro: "ro-RO" }[lang] });
  const page = await context.newPage();
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("http://localhost:4395/");
  await page.waitForTimeout(800);
  const shot = (name) => page.screenshot({ path: join(out, lang, `${name}.png`) });
  const close = async () => { await page.locator(".sheet-close").first().click(); await page.waitForTimeout(400); };

  await shot("1-lists");
  await page.locator(".list-card-main").first().click();
  await page.waitForTimeout(400);
  await shot("2-list");
  await page.locator(".back-button").click();
  await page.locator(".bottom-nav button").nth(2).click();
  await page.locator(".recipe-row .favorite-row-main").first().click();
  await page.waitForTimeout(500);
  await shot("3-recipe");
  await close();
  await page.locator(".recipe-cook").first().click();
  await page.locator(".cooking-nav .primary-button").click();
  await page.locator(".cooking-timer-start").click();
  await page.waitForTimeout(1500);
  await shot("4-cooking");
  await page.locator(".back-button").click();
  await page.locator(".bottom-nav button").nth(4).click();
  await page.locator(".settings-group .setting-row").nth(3).click();
  await page.waitForTimeout(500);
  await shot("5-family");
  await context.close();
  console.log(`${lang}: feature graphic and 5 screenshots`);
}

await browser.close();
server.close();
