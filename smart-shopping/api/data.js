// The signed-in user's lists, stored as one snapshot (the app's ShoppingData) with a version.
// GET /api/data -> { version, data }        version 0 and data null when nothing is stored yet
// PUT /api/data { baseVersion, data } -> { version }
//   409 { version, data } when the stored version is no longer baseVersion, i.e. another
//   device saved in between; the client then continues from the returned snapshot.
import { HttpError, authenticatedUserId, database, json, preflight, readJson, route } from "./_lib.js";

const MAX_SNAPSHOT_BYTES = 1_000_000;

export const OPTIONS = preflight;

async function snapshots() {
  return (await database()).collection("snapshots");
}

export const GET = route(async (request) => {
  const userId = authenticatedUserId(request);
  const saved = await (await snapshots()).findOne({ _id: userId });
  return json(200, { version: saved?.version ?? 0, data: saved?.data ?? null });
});

export const PUT = route(async (request) => {
  const userId = authenticatedUserId(request);
  const { baseVersion, data } = await readJson(request, MAX_SNAPSHOT_BYTES);
  if (!Number.isInteger(baseVersion) || baseVersion < 0) throw new HttpError(400, "Некорректный запрос.");
  if (!data || !Array.isArray(data.lists) || !Array.isArray(data.history)) throw new HttpError(400, "Некорректные данные списков.");

  const collection = await snapshots();
  const snapshot = { data: { lists: data.lists, history: data.history, darkMode: Boolean(data.darkMode) }, version: baseVersion + 1, updatedAt: new Date() };
  let saved = false;
  if (baseVersion === 0) {
    try {
      await collection.insertOne({ _id: userId, ...snapshot });
      saved = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  } else {
    saved = (await collection.updateOne({ _id: userId, version: baseVersion }, { $set: snapshot })).matchedCount === 1;
  }
  if (saved) return json(200, { version: snapshot.version });

  const current = await collection.findOne({ _id: userId });
  return json(409, { version: current?.version ?? 0, data: current?.data ?? null });
});
