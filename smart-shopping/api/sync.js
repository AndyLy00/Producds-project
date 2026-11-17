// POST /api/sync { lists, profile, since } -> { lists, profile, sharing, revoked, now }
//
// The app sends its copy of the lists (all of them after a change, none when it only checks for
// news) and of its profile (stores, templates, recipes, categories, settings). Each list is a
// separate document that may be shared by several accounts; the server merges what it gets into
// the stored copies (shared/merge.js) and answers with every list of the account changed since
// `since`, the merged profile, and the ids of sent lists the account no longer has access to.
import { HttpError, authenticate, database, json, preflight, readJson, route } from "./_lib.js";
import { cleanList, cleanProfile, emptyProfile } from "./_clean.js";
import { mergeList, mergeProfile } from "../shared/merge.js";

// Changes saved by another server instance just before `since` must not be missed; merging the
// same list twice is harmless.
const CLOCK_MARGIN = 10_000;
const MAX_LISTS = 500;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Read-merge-write with a revision check, so that two devices saving at once both get in.
async function saveMerged(collection, filter, incoming, merge, created) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const stored = await collection.findOne(filter);
    if (!stored) {
      if (!created) return null;
      try {
        await collection.insertOne({ ...created, rev: 1, serverUpdatedAt: Date.now() });
        return created.data;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        continue;
      }
    }
    const merged = merge(stored.data, incoming);
    if (same(merged, stored.data)) return stored.data;
    const result = await collection.updateOne(
      { _id: stored._id, rev: stored.rev },
      { $set: { data: merged, serverUpdatedAt: Date.now() }, $inc: { rev: 1 } },
    );
    if (result.matchedCount === 1) return merged;
  }
  throw new HttpError(503, "Сервер занят. Попробуйте ещё раз.");
}

export const OPTIONS = preflight;

export const POST = route(async (request) => {
  const user = await authenticate(request);
  const body = await readJson(request, 4_000_000);
  const since = Number.isFinite(body.since) ? body.since : 0;
  const db = await database();
  const lists = db.collection("lists");
  const startedAt = Date.now();

  const revoked = [];
  const incoming = Array.isArray(body.lists) ? body.lists.slice(0, MAX_LISTS).map(cleanList).filter(Boolean) : [];
  for (const list of incoming) {
    const stored = await lists.findOne({ _id: list.id }, { projection: { members: 1 } });
    if (stored && !stored.members.includes(user._id)) {
      revoked.push(list.id);
      continue;
    }
    await saveMerged(lists, { _id: list.id, members: user._id }, list, mergeList, {
      _id: list.id,
      ownerId: user._id,
      members: [user._id],
      data: list,
    });
  }

  const profiles = db.collection("profiles");
  const incomingProfile = cleanProfile(body.profile);
  const profile = incomingProfile
    ? await saveMerged(profiles, { _id: user._id }, incomingProfile, mergeProfile, { _id: user._id, data: incomingProfile })
    : ((await profiles.findOne({ _id: user._id }))?.data ?? emptyProfile());

  const changed = await lists.find({ members: user._id, serverUpdatedAt: { $gt: since - CLOCK_MARGIN } }).toArray();
  const shared = await lists
    .find({ members: user._id, "members.1": { $exists: true } }, { projection: { members: 1, ownerId: 1 } })
    .toArray();

  return json(200, {
    lists: changed.map((document) => document.data),
    profile,
    sharing: Object.fromEntries(shared.map((document) => [document._id, { members: document.members.length, owner: document.ownerId === user._id }])),
    revoked,
    now: startedAt,
  });
});
