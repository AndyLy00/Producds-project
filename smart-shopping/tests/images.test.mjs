// Product pictures (src/model.ts, productImage): every name that has a picture points to a file
// that exists, in each of the app's languages.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { productImage } from "../src/model.ts";

const publicDir = new URL("../public", import.meta.url);

test("every product picture exists", () => {
  const source = new URL("../src/model.ts", import.meta.url);
  // The names listed in productImages.
  const block = /const productImages[^{]*\{([\s\S]*?)\n\};/.exec(readFileSync(source, "utf8"))[1];
  const names = [...block.matchAll(/"([^"]+)":\s*"[^"]+"/g)].map((match) => match[1]);
  assert.ok(names.length > 60);
  for (const name of names) {
    const path = productImage(name);
    assert.ok(path, name);
    assert.ok(existsSync(new URL(`.${path}`, `${publicDir}/`)), `${name} -> ${path}`);
  }
});

test("names are matched whatever the case and spaces, and only whole names", () => {
  assert.equal(productImage("  Бананы "), "/assets/app/items/bananas.png");
  assert.equal(productImage("Cartofi"), "/assets/app/items/potatoes.png");
  assert.equal(productImage("Buckwheat"), "/assets/app/items/buckwheat.png");
  // Black pepper is "перец" too: it gets no picture rather than the wrong one.
  assert.equal(productImage("перец"), undefined);
  assert.equal(productImage("банановый хлеб"), undefined);
});

