// Tests of the server (api/*.js) against a real MongoDB.
// MONGODB_URI must point at a disposable database; without it the tests are skipped.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

const skip = process.env.MONGODB_URI ? false : "MONGODB_URI is not set";
process.env.AUTH_SECRET ??= "test-secret";
process.env.MONGODB_DB = `korzina-test-${Date.now()}`;
process.env.EMAIL_TRANSPORT = "memory";
delete process.env.GOOGLE_CLIENT_ID;

let api;
let db;

before(async () => {
  if (skip) return;
  const [auth, sync, share, lib] = await Promise.all([import("../api/auth.js"), import("../api/sync.js"), import("../api/share.js"), import("../api/_lib.js")]);
  api = { auth: auth.POST, config: auth.GET, sync: sync.POST, share: share.POST };
  db = await lib.database();
});

after(async () => {
  if (skip) return;
  await db.dropDatabase();
  await db.client.close();
});

// Each test calls from its own address so that the per-address limits do not add up across tests.
let address = 0;
beforeEach(() => {
  address += 1;
  globalThis.korzinaOutbox = [];
});

async function call(handler, body, { token, ip = `198.51.100.${address}` } = {}) {
  const response = await handler(
    new Request("https://korzina.example/api", {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-real-ip": ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

const auth = (body, options) => call(api.auth, body, options);
const register = async (email, password = "long-enough") => (await auth({ action: "register", email, password })).body;
const lastCode = (to) => /\d{6}/.exec(globalThis.korzinaOutbox.filter((mail) => mail.to === to).at(-1)?.subject ?? "")?.[0];

const item = (id, name, updatedAt, extra = {}) => ({ id, name, quantity: "1", unit: "шт.", category: "Бакалея", note: "", purchased: false, favorite: false, order: 1, updatedAt, ...extra });
const list = (id, name, updatedAt, items = []) => ({ id, name, createdAt: 1, updatedAt, sortMode: "category", items });
const profile = (extra = {}) => ({ stores: [], templates: [], recipes: [], categories: [], settings: { darkMode: false, updatedAt: 0 }, ...extra });

test("registration validates input, refuses a duplicate email and sends a verification code", { skip }, async () => {
  assert.equal((await auth({ action: "register", email: "not-an-email", password: "long-enough" })).status, 400);
  assert.equal((await auth({ action: "register", email: "a@example.com", password: "short" })).status, 400);

  const created = await auth({ action: "register", email: " Anna@Example.com ", password: "long-enough" });
  assert.equal(created.status, 201);
  assert.deepEqual({ ...created.body, token: "…" }, { token: "…", email: "anna@example.com", verified: false, hasPassword: true });
  assert.match(lastCode("anna@example.com"), /^\d{6}$/);

  assert.equal((await auth({ action: "register", email: "anna@example.com", password: "another-pass" })).status, 409);
  assert.deepEqual((await call(api.config)).body, { googleClientId: null, email: true });
});

test("the email address is confirmed with the code, and a wrong code is refused", { skip }, async () => {
  const { token } = await register("boris@example.com");
  assert.equal((await auth({ action: "verify-email", code: "000000" }, { token })).status, 400);
  const verified = await auth({ action: "verify-email", code: lastCode("boris@example.com") }, { token });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.verified, true);
  assert.equal((await auth({ action: "me" }, { token })).body.verified, true);
});

test("the password is stored hashed and wrong passwords lock the account for a while", { skip }, async () => {
  await register("dasha@example.com", "correct-horse");
  const stored = await db.collection("users").findOne({ email: "dasha@example.com" });
  assert.ok(!JSON.stringify(stored).includes("correct-horse"));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await auth({ action: "login", email: "dasha@example.com", password: `guess-${attempt}-x` })).status, 401);
  }
  assert.equal((await auth({ action: "login", email: "dasha@example.com", password: "correct-horse" }, { ip: "203.0.113.50" })).status, 429);
});

test("a forgotten password is reset with a code from the email, which signs out other devices", { skip }, async () => {
  const { token: oldToken } = await register("egor@example.com", "first-password");
  assert.deepEqual((await auth({ action: "forgot", email: "nobody@example.com" })).body, { ok: true });
  assert.equal((await auth({ action: "forgot", email: "egor@example.com" })).status, 200);
  const code = lastCode("egor@example.com");

  assert.equal((await auth({ action: "reset", email: "egor@example.com", code: "999999", password: "second-password" })).status, 400);
  const reset = await auth({ action: "reset", email: "egor@example.com", code, password: "second-password" });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.verified, true);
  assert.equal((await auth({ action: "reset", email: "egor@example.com", code, password: "third-password" })).status, 400, "a code works once");

  assert.equal((await auth({ action: "me" }, { token: oldToken })).status, 401, "old sessions end");
  assert.equal((await auth({ action: "login", email: "egor@example.com", password: "second-password" })).status, 200);
});

test("changing the password needs the current one", { skip }, async () => {
  const { token } = await register("zhenya@example.com", "first-password");
  assert.equal((await auth({ action: "change-password", current: "wrong-password", password: "second-password" }, { token })).status, 400);
  const changed = await auth({ action: "change-password", current: "first-password", password: "second-password" }, { token });
  assert.equal(changed.status, 200);
  assert.equal((await auth({ action: "me" }, { token })).status, 401);
  assert.equal((await auth({ action: "me" }, { token: changed.body.token })).status, 200);
});

test("Google sign-in is refused until it is configured, and its one-time code needs the right verifier", { skip }, async () => {
  assert.equal((await auth({ action: "google", credential: "anything" })).status, 503);
  const { token } = await register("google@example.com");
  const user = await db.collection("users").findOne({ email: "google@example.com" });
  const verifier = "v".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await db.collection("handoffs").insertOne({ _id: "one-time", userId: user._id, challenge, expiresAt: new Date(Date.now() + 60_000) });
  assert.equal((await auth({ action: "google-handoff", code: "one-time", verifier: "w".repeat(43) })).status, 400);
  await db.collection("handoffs").insertOne({ _id: "second", userId: user._id, challenge, expiresAt: new Date(Date.now() + 60_000) });
  const handed = await auth({ action: "google-handoff", code: "second", verifier });
  assert.equal(handed.status, 200);
  assert.equal(handed.body.email, "google@example.com");
  assert.ok(token);
});

test("lists need a valid session", { skip }, async () => {
  assert.equal((await call(api.sync, { lists: [] })).status, 401);
  assert.equal((await call(api.sync, { lists: [] }, { token: "forged.token" })).status, 401);
});

test("edits made on two devices at once are merged instead of overwritten", { skip }, async () => {
  const { token } = await register("vera@example.com");
  const t = Date.now() - 60_000;
  const base = list("L1", "Дом", t + 10, [item("a", "Хлеб", t + 10), item("b", "Молоко", t + 10)]);
  const first = await call(api.sync, { lists: [base], profile: profile(), since: 0 }, { token });
  assert.equal(first.status, 200);

  // Phone renames the list and buys bread; laptop (still holding the old copy) deletes milk and adds eggs.
  const phone = { ...base, name: "Дом и дача", updatedAt: t + 20, items: [item("a", "Хлеб", t + 21, { purchased: true }), item("b", "Молоко", t + 10)] };
  const laptop = { ...base, items: [item("a", "Хлеб", t + 10), item("b", "Молоко", t + 22, { deleted: true }), item("c", "Яйца", t + 23)] };
  await call(api.sync, { lists: [phone], profile: null, since: first.body.now }, { token });
  const merged = await call(api.sync, { lists: [laptop], profile: null, since: 0 }, { token });
  const saved = merged.body.lists.find((entry) => entry.id === "L1");
  assert.equal(saved.name, "Дом и дача");
  assert.deepEqual(
    Object.fromEntries(saved.items.map((entry) => [entry.name, entry.deleted ? "deleted" : entry.purchased ? "bought" : "to buy"])),
    { Хлеб: "bought", Молоко: "deleted", Яйца: "to buy" },
  );

  // Asking only for news returns nothing new until something changes.
  const quiet = await call(api.sync, { lists: [], since: merged.body.now + 60_000 }, { token });
  assert.deepEqual(quiet.body.lists, []);
});

test("the profile (stores, templates, recipes, categories, theme) is merged and kept per account", { skip }, async () => {
  const { token } = await register("gleb@example.com");
  await call(api.sync, { lists: [], profile: profile({ recipes: [{ id: "r1", name: "Борщ", note: "", ingredients: [], updatedAt: 5 }] }), since: 0 }, { token });
  const result = await call(api.sync, { lists: [], profile: profile({ stores: [{ id: "s1", name: "У дома", categoryOrder: ["Напитки"], updatedAt: 6 }], settings: { darkMode: true, updatedAt: 7 } }), since: 0 }, { token });
  assert.deepEqual(result.body.profile.recipes.map((recipe) => recipe.name), ["Борщ"]);
  assert.deepEqual(result.body.profile.stores.map((store) => store.name), ["У дома"]);
  assert.equal(result.body.profile.settings.darkMode, true);
  assert.equal(JSON.stringify(result.body.profile).includes("Борщ"), true);

  const { token: other } = await register("other@example.com");
  assert.deepEqual((await call(api.sync, { lists: [], since: 0 }, { token: other })).body.profile.recipes, []);
});

test("a list is shared through an invitation link, and leaving it stops access", { skip }, async () => {
  const owner = (await register("owner@example.com")).token;
  const guest = (await register("guest@example.com")).token;
  await call(api.sync, { lists: [list("S1", "Семья", 5, [item("x", "Сыр", 5)])], profile: profile(), since: 0 }, { token: owner });

  assert.equal((await call(api.share, { action: "invite", listId: "S1" }, { token: guest })).status, 404, "only members can invite");
  const invite = await call(api.share, { action: "invite", listId: "S1" }, { token: owner });
  assert.match(invite.body.link, /^https:\/\/korzina\.example\/join\?invite=/);
  assert.equal((await call(api.share, { action: "invite", listId: "S1", email: "friend@example.com" }, { token: owner })).status, 403, "unconfirmed senders cannot email");

  const joined = await call(api.share, { action: "join", token: new URL(invite.body.link).searchParams.get("invite") }, { token: guest });
  assert.deepEqual(joined.body, { listId: "S1", name: "Семья" });

  const guestView = await call(api.sync, { lists: [], since: 0 }, { token: guest });
  assert.deepEqual(guestView.body.lists.map((entry) => entry.name), ["Семья"]);
  assert.deepEqual(guestView.body.sharing, { S1: { members: 2, owner: false } });

  // The guest adds a product; the owner sees it.
  await call(api.sync, { lists: [{ ...guestView.body.lists[0], items: [...guestView.body.lists[0].items, item("y", "Хлеб", 9)] }], since: 0 }, { token: guest });
  const ownerView = await call(api.sync, { lists: [], since: 0 }, { token: owner });
  assert.deepEqual(ownerView.body.lists[0].items.map((entry) => entry.name).sort(), ["Сыр", "Хлеб"]);
  const members = await call(api.share, { action: "members", listId: "S1" }, { token: owner });
  assert.deepEqual(members.body.members.map((member) => member.email).sort(), ["guest@example.com", "owner@example.com"]);

  await call(api.share, { action: "leave", listId: "S1" }, { token: guest });
  const afterLeave = await call(api.sync, { lists: guestView.body.lists, since: 0 }, { token: guest });
  assert.deepEqual(afterLeave.body.revoked, ["S1"]);
  assert.deepEqual(afterLeave.body.lists, []);
});

test("deleting the account removes it and keeps shared lists for the others", { skip }, async () => {
  const owner = (await register("leaving@example.com", "my-password")).token;
  const friend = (await register("staying@example.com")).token;
  await call(api.sync, { lists: [list("D1", "Общий", 5), list("D2", "Личный", 5)], profile: profile(), since: 0 }, { token: owner });
  const invite = await call(api.share, { action: "invite", listId: "D1" }, { token: owner });
  await call(api.share, { action: "join", token: new URL(invite.body.link).searchParams.get("invite") }, { token: friend });

  assert.equal((await auth({ action: "delete-account", password: "wrong-password" }, { token: owner })).status, 400);
  assert.equal((await auth({ action: "delete-account", password: "my-password" }, { token: owner })).status, 200);
  assert.equal((await auth({ action: "login", email: "leaving@example.com", password: "my-password" })).status, 401);
  assert.equal(await db.collection("lists").countDocuments({ _id: "D2" }), 0);
  assert.deepEqual((await call(api.sync, { lists: [], since: 0 }, { token: friend })).body.lists.map((entry) => entry.name), ["Общий"]);
});

test("wrong passwords sent all at once are still limited", { skip }, async () => {
  await register("rush@example.com", "correct-horse");
  const guesses = await Promise.all(
    Array.from({ length: 20 }, (_, index) => auth({ action: "login", email: "rush@example.com", password: `guess-${index}-x` })),
  );
  const checked = guesses.filter((result) => result.status === 401).length;
  assert.ok(checked <= 5, `only 5 passwords may be checked, ${checked} were`);
  assert.equal(guesses.filter((result) => result.status === 429).length, 20 - checked);
});

test("a correct password does not use up the address's attempts", { skip }, async () => {
  await register("often@example.com", "correct-horse");
  for (let attempt = 0; attempt < 35; attempt += 1) {
    assert.equal((await auth({ action: "login", email: "often@example.com", password: "correct-horse" }, { ip: "192.0.2.77" })).status, 200);
  }
});

test("Google sign-in takes over an account whose address was never confirmed", { skip }, async () => {
  // Someone registers with another person's address and a password of their own.
  const squatter = await register("victim@example.com", "squatter-pass");
  const realFetch = globalThis.fetch;
  process.env.GOOGLE_CLIENT_ID = "client-id";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ aud: "client-id", iss: "accounts.google.com", sub: "g-1", email: "victim@example.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 600) }));
  try {
    const signedIn = await auth({ action: "google", credential: "token" });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.hasPassword, false);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_CLIENT_ID;
  }
  assert.equal((await auth({ action: "me" }, { token: squatter.token })).status, 401, "the registrant's session ends");
  assert.equal((await auth({ action: "login", email: "victim@example.com", password: "squatter-pass" })).status, 401, "and the password no longer works");
});

test("Google sign-in keeps the password of a confirmed account", { skip }, async () => {
  const { token } = await register("owner-g@example.com", "own-password");
  await auth({ action: "verify-email", code: lastCode("owner-g@example.com") }, { token });
  const realFetch = globalThis.fetch;
  process.env.GOOGLE_CLIENT_ID = "client-id";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ aud: "client-id", iss: "accounts.google.com", sub: "g-2", email: "owner-g@example.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 600) }));
  try {
    assert.equal((await auth({ action: "google", credential: "token" })).body.hasPassword, true);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_CLIENT_ID;
  }
  assert.equal((await auth({ action: "me" }, { token })).status, 200);
});

test("changes stamped far in the future cannot win forever", { skip }, async () => {
  const { token } = await register("clock@example.com");
  const future = Date.now() + 365 * 86_400_000;
  const result = await call(api.sync, { lists: [list("C1", "Будущее", future, [item("a", "Хлеб", future)])], profile: null, since: 0 }, { token });
  const saved = result.body.lists.find((entry) => entry.id === "C1");
  const limit = Date.now() + 5 * 60_000;
  assert.ok(saved.updatedAt <= limit && saved.items[0].updatedAt <= limit, "stamps are held to at most 5 minutes ahead");
  // So an edit made a little later wins.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const fixed = await call(api.sync, { lists: [list("C1", "Сейчас", Date.now() + 5 * 60_000 + 5, [])], profile: null, since: 0 }, { token });
  assert.equal(fixed.body.lists.find((entry) => entry.id === "C1").name, "Сейчас");
});

test("removed products never push out live ones, and old removals are forgotten", { skip }, async () => {
  const { token } = await register("churn@example.com");
  const now = Date.now();
  const removed = Array.from({ length: 1500 }, (_, index) => item(`old-${index}`, `Удалён ${index}`, now - 1000, { deleted: true }));
  const ancient = item("ancient", "Давно удалён", now - 90 * 86_400_000, { deleted: true });
  const result = await call(api.sync, { lists: [list("T1", "Много", now, [...removed, ancient, item("live", "Хлеб", now)])], profile: null, since: 0 }, { token });
  const saved = result.body.lists.find((entry) => entry.id === "T1");
  assert.ok(saved.items.some((entry) => entry.id === "live" && !entry.deleted));
  assert.ok(!saved.items.some((entry) => entry.id === "ancient"));
});
