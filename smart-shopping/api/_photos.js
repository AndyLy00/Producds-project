// Upkeep of recipe photos (api/photo.js), used by the sync.

// Photos of the account that no live recipe uses any more. A photo uploaded in the last day is
// kept even when unused: the recipe that uses it may not have reached the server yet.
export async function removeUnusedPhotos(db, userId, profile) {
  const used = new Set(profile.recipes.filter((recipe) => !recipe.deleted && recipe.photo).map((recipe) => recipe.photo));
  const old = await db
    .collection("photos")
    .find({ owner: userId, createdAt: { $lt: new Date(Date.now() - 86_400_000) } }, { projection: { _id: 1 } })
    .toArray();
  const unused = old.map((photo) => photo._id).filter((id) => !used.has(id));
  if (unused.length) await db.collection("photos").deleteMany({ _id: { $in: unused }, owner: userId });
}
