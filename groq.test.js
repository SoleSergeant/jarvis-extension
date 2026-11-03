import { test } from "node:test";
import assert from "node:assert/strict";
import { checkResult, cleanAnswer } from "./groq.js";

test("search keeps the question and drops any time", () =>
  assert.deepEqual(checkResult({ type: "search", title: "how tall is everest", when: "2026-11-03T10:00" }), {
    type: "search",
    title: "how tall is everest",
    when: null,
  }));
test("cleanAnswer strips citations and markdown", () =>
  assert.equal(cleanAnswer("Mount Everest is **8,849 m** tall.【1†L3-L5】\n Source: survey【2†L1】"), "Mount Everest is 8,849 m tall. Source: survey"));

test("keeps a valid reminder", () =>
  assert.deepEqual(checkResult({ type: "reminder", title: " call mom ", when: "2026-11-03T17:00" }), {
    type: "reminder",
    title: "call mom",
    when: new Date(2026, 10, 3, 17, 0).getTime(),
  }));
test("task may have no time", () =>
  assert.deepEqual(checkResult({ type: "task", title: "buy milk", when: null }), { type: "task", title: "buy milk", when: null }));
test("rejects none", () => assert.equal(checkResult({ type: "none", title: "", when: null }), null));
test("rejects reminder without time", () => assert.equal(checkResult({ type: "reminder", title: "x", when: null }), null));
test("rejects malformed time", () => assert.equal(checkResult({ type: "event", title: "x", when: "tomorrow" }), null));
test("rejects missing title", () => assert.equal(checkResult({ type: "task", when: null }), null));
test("rejects null", () => assert.equal(checkResult(null), null));
