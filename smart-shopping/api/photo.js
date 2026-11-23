// Recipe photos, stored in MongoDB next to the rest of the account's data.
//   POST /api/photo?id=<photo id>   body: the image (JPEG, PNG or WebP), signed in -> { id }
//   GET  /api/photo?id=<photo id>   -> the image
//
// The app shrinks photos before sending them (src/photos.ts), so they are small. Ids are long
// random strings made by the app; they are not secret in the way a password is, but nobody can
// guess one, which is why reading a photo needs no session (an <img> cannot send one anyway).
import { HttpError, authenticate, database, json, preflight, route } from "./_lib.js";
import { validPhotoId } from "./_clean.js";

const MAX_BYTES = 800_000;
const MAX_PHOTOS = 300;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

function photoId(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!validPhotoId(id)) throw new HttpError(400, "Некорректный запрос.");
  return id;
}

export const OPTIONS = preflight;

export const GET = route(async (request) => {
  const photo = await (await database()).collection("photos").findOne({ _id: photoId(request) });
  if (!photo) throw new HttpError(404, "Фото не найдено.");
  return new Response(photo.data.buffer, {
    headers: { "Content-Type": photo.type, "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" },
  });
});

export const POST = route(async (request) => {
  const user = await authenticate(request);
  const id = photoId(request);
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!TYPES.includes(type)) throw new HttpError(415, "Можно загрузить только фото.");
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0) throw new HttpError(400, "Некорректный запрос.");
  if (data.length > MAX_BYTES) throw new HttpError(413, "Фото слишком большое.");

  const photos = (await database()).collection("photos");
  const existing = await photos.findOne({ _id: id }, { projection: { owner: 1 } });
  // Sending the same photo again (a retry after a lost answer) is fine.
  if (existing) {
    if (existing.owner !== user._id) throw new HttpError(409, "Некорректный запрос.");
    return json(200, { id });
  }
  if ((await photos.countDocuments({ owner: user._id })) >= MAX_PHOTOS) throw new HttpError(403, "Слишком много фото. Удалите старые рецепты.");
  try {
    await photos.insertOne({ _id: id, owner: user._id, type, data, createdAt: new Date() });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  return json(201, { id });
});
