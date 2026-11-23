// POST /api/sync { lists, known, profile, since } -> { lists, profile, sharing, revoked, familySize, now }
//
// The app sends its copy of the lists (all of them after a change, none when it only checks for
// news) and of its profile (stores, templates, recipes, categories, settings). Each list is a
// separate document that may be shared by several accounts; the server merges what it gets into
// the stored copies (shared/merge.js) and answers with every list of the account changed since
// `since`, the merged profile, and the ids of known lists the account no longer has access to.
// Lists of the account's family count as the account's own (api/_family.js).
import { HttpError, authenticate, database, json, preflight, readJson, route } from "./_lib.js";
import { cleanList, cleanProfile, emptyProfile } from "./_clean.js";
import { removeUnusedPhotos } from "./_photos.js";
import { accessFilter, canOpen, familyMembers, sharingOf } from "./_family.js";
import { mergeList, mergeProfile, pruneList, pruneProfile } from "../shared/merge.js";

// Merging also drops tombstones that have outlived their purpose (shared/merge.js).
const mergeStoredList = (stored, incoming) => pruneList(mergeList(stored, incoming));
const mergeStoredProfile = (stored, incoming) => pruneProfile(mergeProfile(stored, incoming));

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

  const family = await familyMembers(db, user._id);
  const access = accessFilter(user._id, family);

  // Lists the app holds that the account can no longer open (it left the list or the family,
  // or a list was made personal): the app drops them. `known` names every list the app has,
  // so this is noticed even when only checking for news.
  const incoming = Array.isArray(body.lists) ? body.lists.slice(0, MAX_LISTS).map(cleanList).filter(Boolean) : [];
  const known = new Set([...incoming.map((list) => list.id), ...(Array.isArray(body.known) ? body.known.slice(0, MAX_LISTS).filter((id) => typeof id === "string") : [])]);
  const stored = await lists.find({ _id: { $in: [...known] } }, { projection: { members: 1, "data.personal": 1 } }).toArray();
  const revoked = stored.filter((list) => !canOpen(list, user._id, family)).map((list) => list._id);

  for (const list of incoming) {
    if (revoked.includes(list.id)) continue;
    await saveMerged(lists, { _id: list.id, ...access }, list, mergeStoredList, {
      _id: list.id,
      ownerId: user._id,
      members: [user._id],
      data: pruneList(list),
    });
  }

  const profiles = db.collection("profiles");
  const incomingProfile = cleanProfile(body.profile);
  const profile = incomingProfile
    ? await saveMerged(profiles, { _id: user._id }, incomingProfile, mergeStoredProfile, { _id: user._id, data: incomingProfile })
    : ((await profiles.findOne({ _id: user._id }))?.data ?? emptyProfile());
  if (incomingProfile) await removeUnusedPhotos(db, user._id, profile);

  const changed = await lists.find({ ...access, serverUpdatedAt: { $gt: since - CLOCK_MARGIN } }).toArray();
  const visible = await lists.find(access, { projection: { members: 1, ownerId: 1, "data.personal": 1 } }).toArray();
  const sharing = visible.map((list) => [list._id, sharingOf(list, user._id, family)]).filter(([, entry]) => entry.members > 1);

  return json(200, {
    lists: changed.map((document) => document.data),
    profile,
    sharing: Object.fromEntries(sharing),
    revoked,
    // Lets the app notice that someone joined or left its family.
    familySize: family.length,
    now: startedAt,
  });
});
