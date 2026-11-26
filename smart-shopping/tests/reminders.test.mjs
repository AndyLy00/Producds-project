// Repeating reminders of lists (src/model.ts) and how the server keeps them (api/_clean.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanList } from "../api/_clean.js";
import { setLanguage } from "../src/i18n.ts";
import { formatRepeat, nextReminder, repeatTimes } from "../src/model.ts";

setLanguage("ru");

// Wednesday, 25 November 2026, 12:00 local time.
const wednesday = new Date(2026, 10, 25, 12, 0).getTime();
const local = (...parts) => new Date(...parts).getTime();

test("a daily reminder comes every day at its time, starting with the next one", () => {
  assert.deepEqual(repeatTimes({ every: "day", days: [], time: "10:00" }, 2, wednesday), [local(2026, 10, 26, 10, 0), local(2026, 10, 27, 10, 0)]);
  assert.equal(repeatTimes({ every: "day", days: [], time: "18:30" }, 1, wednesday)[0], local(2026, 10, 25, 18, 30));
});

test("a weekly reminder comes on the chosen weekdays", () => {
  // Saturday and Monday.
  assert.deepEqual(repeatTimes({ every: "week", days: [6, 1], time: "09:15" }, 3, wednesday), [
    local(2026, 10, 28, 9, 15),
    local(2026, 10, 30, 9, 15),
    local(2026, 11, 5, 9, 15),
  ]);
  assert.deepEqual(repeatTimes({ every: "week", days: [], time: "09:15" }, 3, wednesday), []);
});

test("a monthly reminder on the 31st comes on the last day of shorter months", () => {
  assert.deepEqual(repeatTimes({ every: "month", days: [31], time: "20:00" }, 3, wednesday), [
    local(2026, 10, 30, 20, 0),
    local(2026, 11, 31, 20, 0),
    local(2027, 0, 31, 20, 0),
  ]);
});

test("the next reminder of a list is the earlier of the one-time and the repeating one", () => {
  const list = { id: "l", name: "Неделя", createdAt: 0, updatedAt: 0, sortMode: "category", items: [] };
  assert.equal(nextReminder(list, wednesday), undefined);
  assert.equal(nextReminder({ ...list, remindAt: wednesday - 1 }, wednesday), undefined);
  const repeat = { every: "week", days: [6], time: "10:00" };
  assert.equal(nextReminder({ ...list, repeat }, wednesday), local(2026, 10, 28, 10, 0));
  assert.equal(nextReminder({ ...list, repeat, remindAt: local(2026, 10, 26, 8, 0) }, wednesday), local(2026, 10, 26, 8, 0));
});

test("rules are described in words", () => {
  assert.equal(formatRepeat({ every: "day", days: [], time: "10:00" }), "каждый день в 10:00");
  assert.equal(formatRepeat({ every: "month", days: [15], time: "09:00" }), "каждый месяц, 15-го числа в 09:00");
  assert.match(formatRepeat({ every: "week", days: [6, 1], time: "18:00" }), /^по дням: .+, .+, в 18:00$/);
});

test("the server keeps only valid repeating reminders", () => {
  const list = (repeat) => cleanList({ id: "l", name: "Неделя", updatedAt: 1, items: [], repeat });
  assert.deepEqual(list({ every: "week", days: [6, 6, 1, 9, "2"], time: "10:00" }).repeat, { every: "week", days: [6, 1], time: "10:00" });
  assert.deepEqual(list({ every: "day", days: [3], time: "07:05" }).repeat, { every: "day", days: [], time: "07:05" });
  assert.deepEqual(list({ every: "month", days: [31], time: "23:59" }).repeat, { every: "month", days: [31], time: "23:59" });
  assert.equal(list({ every: "week", days: [], time: "10:00" }).repeat, undefined);
  assert.equal(list({ every: "month", days: [0], time: "10:00" }).repeat, undefined);
  assert.equal(list({ every: "day", days: [], time: "24:00" }).repeat, undefined);
  assert.equal(list({ every: "hour", days: [], time: "10:00" }).repeat, undefined);
  assert.equal(list(undefined).repeat, undefined);
});
