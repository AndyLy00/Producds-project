// Family: accounts that see each other's lists (api/_family.js). POST /api/family { action, ... }:
//   get                      -> { family: { members: [{ email, owner, you }], owner } | null }
//   invite  { email? }       -> { link }   creates the family if needed; link valid for 7 days
//   preview { token }        -> { from, members }   who invites, before the user agrees to join
//   join    { token }        -> { ok }
//   leave                    -> { ok }
//   remove  { email }        -> { ok }   the family's creator takes someone out
import { randomUUID } from "node:crypto";
import { HttpError, appOrigin, authenticate, database, json, parseEmail, preflight, randomToken, readJson, route, sendEmail, takeAttempt } from "./_lib.js";
import { MAX_FAMILY, leaveFamily } from "./_family.js";
import { languageOf, tr } from "./_i18n.js";

const INVITE_DAYS = 7;

async function familyOf(db, user) {
  return db.collection("families").findOne({ members: user._id });
}

async function validInvite(db, token) {
  const invite = typeof token === "string" ? await db.collection("invites").findOne({ _id: token }) : null;
  const family = invite?.familyId && invite.expiresAt > new Date() ? await db.collection("families").findOne({ _id: invite.familyId }) : null;
  if (!family) throw new HttpError(404, "Приглашение устарело. Попросите прислать новое.");
  return { invite, family };
}

const actions = {
  async get(request, body, user, db) {
    const family = await familyOf(db, user);
    if (!family) return json(200, { family: null });
    const people = await db.collection("users").find({ _id: { $in: family.members } }, { projection: { email: 1 } }).toArray();
    const members = family.members
      .map((id) => people.find((person) => person._id === id))
      .filter(Boolean)
      .map((person) => ({ email: person.email, owner: person._id === family.ownerId, you: person._id === user._id }));
    return json(200, { family: { members, owner: family.ownerId === user._id } });
  },

  async invite(request, body, user, db) {
    await takeAttempt(`family-invite:${user._id}`, 30, 3600);
    let family = await familyOf(db, user);
    if (!family) {
      family = { _id: randomUUID(), ownerId: user._id, members: [user._id], createdAt: new Date() };
      try {
        await db.collection("families").insertOne(family);
      } catch (error) {
        // Created at the same moment by another request of the same user.
        if (error?.code !== 11000) throw error;
        family = await familyOf(db, user);
      }
    }
    if (family.members.length >= MAX_FAMILY) throw new HttpError(403, "В семье может быть не больше {max} человек.", { max: MAX_FAMILY });
    const token = randomToken();
    await db.collection("invites").insertOne({ _id: token, familyId: family._id, invitedBy: user._id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) });
    const link = `${appOrigin(request)}/join?family=${token}`;
    if (body.email) {
      if (!user.emailVerified) throw new HttpError(403, "Подтвердите свою почту в настройках, чтобы отправлять приглашения письмом.");
      await sendEmail(
        parseEmail(body.email),
        tr(languageOf(request), "{from} приглашает вас в семью в «Корзине»", { from: user.email }),
        tr(languageOf(request), "Здравствуйте!\n\n{from} приглашает вас в семью в приложении «Корзина». В семье все списки покупок общие: изменения видны всем сразу.\n\nЧтобы присоединиться, откройте ссылку и войдите в аккаунт:\n{link}\n\nСсылка действует {days} дней.", { from: user.email, link, days: INVITE_DAYS }),
      );
    }
    return json(200, { link });
  },

  async preview(request, body, user, db) {
    const { invite, family } = await validInvite(db, body.token);
    const from = await db.collection("users").findOne({ _id: invite.invitedBy }, { projection: { email: 1 } });
    return json(200, { from: from?.email ?? null, members: family.members.length, already: family.members.includes(user._id) });
  },

  async join(request, body, user, db) {
    const { family } = await validInvite(db, body.token);
    if (family.members.includes(user._id)) return json(200, { ok: true });
    if (await familyOf(db, user)) throw new HttpError(409, "Вы уже в другой семье. Сначала выйдите из неё в настройках.");
    const joined = await db.collection("families").updateOne(
      { _id: family._id, [`members.${MAX_FAMILY - 1}`]: { $exists: false } },
      { $addToSet: { members: user._id } },
    ).catch((error) => {
      if (error?.code === 11000) throw new HttpError(409, "Вы уже в другой семье. Сначала выйдите из неё в настройках.");
      throw error;
    });
    if (joined.matchedCount === 0) throw new HttpError(403, "В семье может быть не больше {max} человек.", { max: MAX_FAMILY });
    // The family's devices only ask for lists changed since they last looked: the newcomer's
    // lists count as changed now, so that they reach everyone.
    await db.collection("lists").updateMany({ members: user._id }, { $set: { serverUpdatedAt: Date.now() } });
    return json(200, { ok: true });
  },

  async leave(request, body, user, db) {
    await leaveFamily(db, user._id);
    return json(200, { ok: true });
  },

  async remove(request, body, user, db) {
    const family = await familyOf(db, user);
    if (!family || family.ownerId !== user._id) throw new HttpError(403, "Убирать людей из семьи может только её создатель.");
    const member = await db.collection("users").findOne({ email: parseEmail(body.email), _id: { $in: family.members } }, { projection: { _id: 1 } });
    if (!member || member._id === user._id) throw new HttpError(404, "Такого человека нет в семье.");
    await leaveFamily(db, member._id);
    return json(200, { ok: true });
  },
};

export const OPTIONS = preflight;

export const POST = route(async (request) => {
  const user = await authenticate(request);
  const body = await readJson(request, 5_000);
  const handler = Object.hasOwn(actions, body.action) ? actions[body.action] : null;
  if (!handler) throw new HttpError(400, "Некорректный запрос.");
  return handler(request, body, user, await database());
});
