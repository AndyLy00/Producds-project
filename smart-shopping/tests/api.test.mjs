// Tests of the account API (api/*.js) against a real MongoDB.
// MONGODB_URI must point at a disposable database; without it the tests are skipped.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const skip = process.env.MONGODB_URI ? false : "MONGODB_URI is not set";
process.env.AUTH_SECRET ??= "test-secret";
process.env.MONGODB_DB = `korzina-test-${Date.now()}`;

let api;
let db;

before(async () => {
  if (skip) return;
  const [register, login, data, lib] = await Promise.all([
    import("../api/register.js"),
    import("../api/login.js"),
    import("../api/data.js"),
    import("../api/_lib.js"),
  ]);
  api = { register: register.POST, login: login.POST, get: data.GET, put: data.PUT };
  db = await lib.database();
});

after(async () => {
  if (skip) return;
  await db.dropDatabase();
  await db.client.close();
});

async function call(handler, { method = "POST", token, body } = {}) {
  const response = await handler(
    new Request("https://example.test/api", {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

const lists = (name) => ({ lists: [{ id: "1", name, createdAt: 1, updatedAt: 1, items: [] }], history: [], darkMode: false });

test("registration validates input and refuses a duplicate email", { skip }, async () => {
  assert.equal((await call(api.register, { body: { email: "not-an-email", password: "long-enough" } })).status, 400);
  assert.equal((await call(api.register, { body: { email: "a@example.com", password: "short" } })).status, 400);

  const created = await call(api.register, { body: { email: " Anna@Example.com ", password: "long-enough" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.email, "anna@example.com");
  assert.ok(created.body.token);

  assert.equal((await call(api.register, { body: { email: "anna@example.com", password: "another-pass" } })).status, 409);
});

test("the password is stored hashed and checked on login", { skip }, async () => {
  await call(api.register, { body: { email: "boris@example.com", password: "correct-horse" } });
  const stored = await db.collection("users").findOne({ email: "boris@example.com" });
  assert.ok(!JSON.stringify(stored).includes("correct-horse"));

  assert.equal((await call(api.login, { body: { email: "boris@example.com", password: "wrong-horse" } })).status, 401);
  assert.equal((await call(api.login, { body: { email: "nobody@example.com", password: "correct-horse" } })).status, 401);
  const session = await call(api.login, { body: { email: "boris@example.com", password: "correct-horse" } });
  assert.equal(session.status, 200);
  assert.ok(session.body.token);
});

test("lists need a valid session", { skip }, async () => {
  assert.equal((await call(api.get, { method: "GET" })).status, 401);
  assert.equal((await call(api.get, { method: "GET", token: "forged.token" })).status, 401);
});

test("lists are saved per account and a stale save is rejected with the stored copy", { skip }, async () => {
  const vera = (await call(api.register, { body: { email: "vera@example.com", password: "long-enough" } })).body.token;
  const gleb = (await call(api.register, { body: { email: "gleb@example.com", password: "long-enough" } })).body.token;

  assert.deepEqual((await call(api.get, { method: "GET", token: vera })).body, { version: 0, data: null });

  const first = await call(api.put, { method: "PUT", token: vera, body: { baseVersion: 0, data: lists("Дом") } });
  assert.deepEqual(first, { status: 200, body: { version: 1 } });
  const second = await call(api.put, { method: "PUT", token: vera, body: { baseVersion: 1, data: lists("Дача") } });
  assert.deepEqual(second, { status: 200, body: { version: 2 } });

  // Another device still at version 1 must not overwrite version 2.
  const stale = await call(api.put, { method: "PUT", token: vera, body: { baseVersion: 1, data: lists("Старое") } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.version, 2);
  assert.equal(stale.body.data.lists[0].name, "Дача");

  assert.equal((await call(api.get, { method: "GET", token: vera })).body.data.lists[0].name, "Дача");
  assert.deepEqual((await call(api.get, { method: "GET", token: gleb })).body, { version: 0, data: null });

  assert.equal((await call(api.put, { method: "PUT", token: vera, body: { baseVersion: 2, data: { lists: "nope" } } })).status, 400);
});
