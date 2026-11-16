import { test } from "node:test";
import assert from "node:assert/strict";
import { briefing } from "./briefing.js";

const now = new Date(2026, 10, 10, 8, 0); // Tue 10 Nov 2026, 08:00 local
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
const item = (type, title, when, done = false) => ({ id: title, type, title, when, done });

test("reads today's events and reminders in time order, then tasks", () =>
  assert.equal(
    briefing(
      [
        item("reminder", "call mom", at(10, 17)),
        item("event", "math exam", at(10, 10, 30)),
        item("task", "submit essay", at(10, 9)),
        item("task", "buy milk", at(8, 9)),
        item("task", "read chapter 3", null),
        item("task", "old thing", null, true),
        item("event", "MUN meeting", at(11, 18)),
      ],
      now,
    ),
    "Today: math exam at 10:30 AM, and a reminder to call mom at 5 PM. Due today: submit essay. Overdue: buy milk. You also have 1 open task with no date.",
  ));
test("an empty day says so", () => assert.equal(briefing([item("event", "MUN meeting", at(11, 18))], now), "Nothing on today."));
test("done items and other days are left out", () =>
  assert.equal(briefing([item("event", "gym", at(10, 7), true), item("task", "a", null), item("task", "b", null)], now), "Nothing on today. You have 2 open tasks with no date."));
