// Family news sent as push notifications (api/_push.js): someone was sent to the store with a
// list, or the person sent to the store completed it. The app tells the same news itself when it
// syncs while open (src/app/useShoppingApp.ts); these reach a phone with the app closed.
import { canOpen, familyMembers } from "./_family.js";
import { sendPush } from "./_push.js";

// News in a list that `sender` (the account that saved it) has just changed from `before` to
// `after`. Only what the sender did themselves counts: nobody can make the app notify others in
// someone else's name.
export function familyNews(before, after, sender) {
  const news = [];
  const shopper = after.shopper;
  const name = (email) => email.split("@")[0];
  const left = after.items.filter((item) => !item.deleted && !item.purchased).length;
  if (shopper && !after.completedAt && shopper.by === sender && shopper.email !== sender && shopper.at !== before?.shopper?.at) {
    news.push({
      listId: after.id,
      to: shopper.email,
      kind: "sent",
      title: "Вас просят сходить в магазин",
      body: "{name}: «{list}», осталось купить {left}",
      params: { name: name(sender), list: after.name, left },
    });
  }
  if (after.completedAt && !before?.completedAt && after.completedBy === sender && shopper && shopper.by !== sender) {
    news.push({
      listId: after.id,
      to: shopper.by,
      kind: "done",
      title: "Покупки сделаны",
      body: "{name} купил(а) всё по списку «{list}»",
      params: { name: name(sender), list: after.name },
    });
  }
  return news;
}

// Sends each piece of news to its addressee, if they can still open the list.
export async function sendFamilyNews(db, news) {
  for (const entry of news) {
    const recipient = await db.collection("users").findOne({ email: entry.to }, { projection: { _id: 1 } });
    if (!recipient) continue;
    const list = await db.collection("lists").findOne({ _id: entry.listId }, { projection: { members: 1, "data.personal": 1 } });
    if (!list || !canOpen(list, recipient._id, await familyMembers(db, recipient._id))) continue;
    await sendPush(db, [recipient._id], { title: entry.title, body: entry.body, params: entry.params, data: { listId: entry.listId, kind: entry.kind } });
  }
}
