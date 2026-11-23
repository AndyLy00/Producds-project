// Shared lists. POST /api/share { action, ... }:
//   invite  { listId, email? } -> { link }   invitation link valid for 7 days, optionally emailed
//   join    { token }          -> { listId, name }
//   leave   { listId }         -> { ok }
//   members { listId }         -> { members: [{ email, owner, you }] }
import {
  HttpError,
  appOrigin,
  authenticate,
  database,
  json,
  parseEmail,
  preflight,
  randomToken,
  readJson,
  route,
  sendEmail,
  takeAttempt,
} from "./_lib.js";

const INVITE_DAYS = 7;

async function memberList(db, listId, user) {
  const list = typeof listId === "string" ? await db.collection("lists").findOne({ _id: listId, members: user._id }) : null;
  if (!list) throw new HttpError(404, "Список не найден. Возможно, его ещё не успели сохранить — попробуйте через пару секунд.");
  return list;
}

const actions = {
  async invite(request, body, user, db) {
    const list = await memberList(db, body.listId, user);
    await takeAttempt(`invite:${user._id}`, 30, 3600);
    const token = randomToken();
    await db.collection("invites").insertOne({
      _id: token,
      listId: list._id,
      invitedBy: user._id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    });
    const link = `${appOrigin(request)}/join?invite=${token}`;
    if (body.email) {
      // Only confirmed addresses may make the server send mail to other people.
      if (!user.emailVerified) throw new HttpError(403, "Подтвердите свою почту в настройках, чтобы отправлять приглашения письмом.");
      const to = parseEmail(body.email);
      await sendEmail(
        to,
        `${user.email} приглашает вас в список «${list.data.name}»`,
        `Здравствуйте!\n\n${user.email} приглашает вас вести вместе список покупок «${list.data.name}» в приложении «Корзина».\n\nЧтобы присоединиться, откройте ссылку и войдите в аккаунт:\n${link}\n\nСсылка действует ${INVITE_DAYS} дней.`,
      );
    }
    return json(200, { link });
  },

  async join(request, body, user, db) {
    const invite = typeof body.token === "string" ? await db.collection("invites").findOne({ _id: body.token }) : null;
    if (!invite || invite.expiresAt < new Date()) throw new HttpError(404, "Приглашение устарело. Попросите прислать новое.");
    const list = await db.collection("lists").findOneAndUpdate(
      { _id: invite.listId },
      { $addToSet: { members: user._id }, $set: { serverUpdatedAt: Date.now() } },
      { returnDocument: "after" },
    );
    if (!list) throw new HttpError(404, "Этот список уже удалён.");
    return json(200, { listId: list._id, name: list.data.name });
  },

  async leave(request, body, user, db) {
    const list = await memberList(db, body.listId, user);
    const members = list.members.filter((id) => id !== user._id);
    if (members.length === 0) {
      await db.collection("lists").deleteOne({ _id: list._id });
    } else {
      await db.collection("lists").updateOne(
        { _id: list._id },
        { $set: { members, ownerId: list.ownerId === user._id ? members[0] : list.ownerId, serverUpdatedAt: Date.now() } },
      );
    }
    return json(200, { ok: true });
  },

  async members(request, body, user, db) {
    const list = await memberList(db, body.listId, user);
    const users = await db.collection("users").find({ _id: { $in: list.members } }, { projection: { email: 1 } }).toArray();
    return json(200, {
      members: users.map((member) => ({ email: member.email, owner: member._id === list.ownerId, you: member._id === user._id })),
    });
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
