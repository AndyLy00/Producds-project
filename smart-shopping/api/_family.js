// Families. A family is a group of accounts that see each other's lists: a list is open to an
// account when the account is one of the list's members, or when the list is not marked
// personal and one of its members is in the account's family. Access is worked out on every
// request rather than written into the lists, so leaving a family takes the access away at once.

export const MAX_FAMILY = 10;

// The ids of the accounts in the user's family, the user included; just the user when there is
// no family.
export async function familyMembers(db, userId) {
  const family = await db.collection("families").findOne({ members: userId }, { projection: { members: 1 } });
  return family?.members ?? [userId];
}

// MongoDB filter for the lists the user may open.
export function accessFilter(userId, family) {
  if (family.length < 2) return { members: userId };
  return { $or: [{ members: userId }, { members: { $in: family }, "data.personal": { $ne: true } }] };
}

// Whether the family sees the list (as opposed to only its own members).
export function sharedWithFamily(list, family) {
  return family.length > 1 && list.data?.personal !== true && list.members.some((id) => family.includes(id));
}

export function canOpen(list, userId, family) {
  return list.members.includes(userId) || sharedWithFamily(list, family);
}

// Takes the user out of their family. The family goes when its last member leaves; when its
// creator leaves, the next member takes over.
export async function leaveFamily(db, userId) {
  const families = db.collection("families");
  // A family is deleted rather than emptied: the unique index on members (api/_lib.js) would
  // treat two empty families as a clash.
  if ((await families.deleteOne({ members: [userId] })).deletedCount) return;
  const family = await families.findOneAndUpdate({ members: userId }, { $pull: { members: userId } }, { returnDocument: "after" });
  if (family && family.ownerId === userId && family.members.length) await families.updateOne({ _id: family._id }, { $set: { ownerId: family.members[0] } });
}

// What the app shows about a list: how many people see it, and whether it is the user's own.
export function sharingOf(list, userId, family) {
  const inFamily = sharedWithFamily(list, family);
  const people = new Set(inFamily ? [...list.members, ...family] : list.members);
  return { members: people.size, owner: list.ownerId === userId, family: inFamily };
}
