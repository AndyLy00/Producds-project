// Push notifications for family news: which changes are news (api/_news.js) and how they are
// sent through Firebase Cloud Messaging (api/_push.js). The network is replaced with a fake.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { familyNews } from "../api/_news.js";

const item = (id, extra = {}) => ({ id, name: id, purchased: false, ...extra });
const list = (extra = {}) => ({ id: "l", name: "Неделя", items: [item("milk"), item("bread", { purchased: true })], ...extra });
const shopper = { email: "anna@example.com", by: "ion@example.com", at: 5 };

test("sending someone to the store is news for them, once", () => {
  const [news] = familyNews(list(), list({ shopper }), "ion@example.com");
  assert.equal(news.to, "anna@example.com");
  assert.equal(news.kind, "sent");
  assert.deepEqual(news.params, { name: "ion", list: "Неделя", left: 1 });
  // The same assignment saved again, or saved by someone else than the sender, is not news.
  assert.deepEqual(familyNews(list({ shopper }), list({ shopper }), "ion@example.com"), []);
  assert.deepEqual(familyNews(list(), list({ shopper }), "anna@example.com"), []);
  // Going yourself is not news for anybody.
  assert.deepEqual(familyNews(list(), list({ shopper: { ...shopper, email: "ion@example.com" } }), "ion@example.com"), []);
});

test("completing the list is news for whoever sent the shopper", () => {
  const done = list({ shopper, completedAt: 9, completedBy: "anna@example.com" });
  const [news] = familyNews(list({ shopper }), done, "anna@example.com");
  assert.equal(news.to, "ion@example.com");
  assert.equal(news.kind, "done");
  assert.deepEqual(familyNews(done, done, "anna@example.com"), []);
  // The sender completing it themselves is not news.
  assert.deepEqual(familyNews(list({ shopper }), { ...done, completedBy: "ion@example.com" }, "ion@example.com"), []);
});

test("news goes to every device of the account in its language, and a dead token is forgotten", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: "korzina-test", client_email: "push@korzina-test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  const { pushEnabled, sendPush } = await import("../api/_push.js");
  assert.equal(pushEnabled(), true);

  const devices = [{ _id: "token-ru-1234567890123", userId: "u1", lang: "ru" }, { _id: "token-en-1234567890123", userId: "u1", lang: "en" }, { _id: "token-gone-123456789012", userId: "u1", lang: "ro" }];
  const deleted = [];
  const db = {
    collection: () => ({
      find: ({ userId }) => ({ toArray: async () => devices.filter((device) => userId.$in.includes(device.userId)) }),
      deleteOne: async ({ _id }) => { deleted.push(_id); },
    }),
  };
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("oauth2")) {
      assert.match(String(init.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
      return new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }));
    }
    assert.equal(url, "https://fcm.googleapis.com/v1/projects/korzina-test/messages:send");
    assert.equal(init.headers.Authorization, "Bearer access");
    const { message } = JSON.parse(init.body);
    if (message.token.startsWith("token-gone")) return new Response(JSON.stringify({ error: { status: "NOT_FOUND" } }), { status: 404 });
    sent.push(message);
    return new Response("{}");
  };
  try {
    const count = await sendPush(db, ["u1"], { title: "Покупки сделаны", body: "{name} купил(а) всё по списку «{list}»", params: { name: "anna", list: "Неделя" }, data: { listId: "l", kind: "done" } });
    assert.equal(count, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(sent.map((message) => message.notification.title).sort(), ["Shopping done", "Покупки сделаны"]);
  assert.equal(sent.find((message) => message.token.startsWith("token-en")).notification.body, "anna bought everything on “Неделя”");
  assert.deepEqual(sent[0].data, { listId: "l", kind: "done" });
  assert.equal(sent[0].android.notification.channel_id, "family");
  assert.deepEqual(deleted, ["token-gone-123456789012"]);
});
