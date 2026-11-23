// Translations (src/i18n.ts): every text the app shows goes through t(), and t() has an English
// and a Romanian version of each, with the same {placeholders}.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import en from "../src/translations/en.ts";
import ro from "../src/translations/ro.ts";
import { serverTexts } from "../api/_i18n.js";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
// Paths relative to the project, with forward slashes.
const files = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
// The browser prototype's device frame (src/mobile) has no Russian text of the app.
const sources = files("src").filter((path) => !path.startsWith("src/mobile/"));
// Russian here is data, not text on screen: product and category names that stay as stored,
// the patterns that recognise them, and the translations themselves.
const dataFiles = new Set(["src/model.ts", "src/i18n.ts", "src/translations/en.ts", "src/translations/ro.ts"]);
const isData = (path) => dataFiles.has(path);
const cyrillic = /[А-Яа-яЁё]/;
const literal = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;

function uncommented(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return "";
  return line.replace(/\s\/\/ .*$/, "");
}

const keys = new Set();
for (const path of sources) {
  for (const match of readFileSync(join(root, path), "utf8").matchAll(literal)) keys.add(JSON.parse(`"${match[1]}"`));
}
// Text that model.ts and others pass to t() through a variable (category and unit names).
for (const extra of Object.keys(en).filter((key) => !keys.has(key))) keys.add(extra);

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test("no Russian text is shown without t()", () => {
  const left = [];
  for (const path of sources) {
    if (isData(path)) continue;
    readFileSync(join(root, path), "utf8").split("\n").forEach((line, index) => {
      const code = uncommented(line).replace(literal, "t(");
      if (cyrillic.test(code)) left.push(`${path}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(left, []);
});

test("every text has an English and a Romanian translation", () => {
  for (const [name, dictionary] of [["en", en], ["ro", ro]]) {
    const missing = [...keys].filter((key) => cyrillic.test(key) && !(key in dictionary));
    assert.deepEqual(missing, [], `${name} lacks translations`);
  }
});

test("translations keep the placeholders and contain no Russian", () => {
  for (const [name, dictionary] of [["en", en], ["ro", ro]]) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.deepEqual(placeholders(value), placeholders(key), `${name}: ${key}`);
      assert.ok(!cyrillic.test(value), `${name}: ${key} -> ${value}`);
    }
  }
});

test("the server's messages are translated too", () => {
  const apiFiles = readdirSync(join(root, "api")).filter((name) => name.endsWith(".js") && name !== "_i18n.js");
  const used = new Set();
  for (const name of apiFiles) {
    const text = readFileSync(join(root, "api", name), "utf8");
    for (const match of text.matchAll(/HttpError\(\d+, "((?:[^"\\]|\\.)*)"|\btr\([^,]+, "((?:[^"\\]|\\.)*)"/g)) used.add(JSON.parse(`"${match[1] ?? match[2]}"`));
  }
  assert.deepEqual([...used].filter((key) => !(key in serverTexts)), [], "server texts without a translation");
  for (const [key, value] of Object.entries(serverTexts)) {
    for (const lang of ["en", "ro"]) {
      assert.ok(value[lang], `${lang} lacks: ${key}`);
      assert.deepEqual(placeholders(value[lang]), placeholders(key), `${lang}: ${key}`);
    }
  }
});
