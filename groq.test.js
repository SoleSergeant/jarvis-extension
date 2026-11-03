import { test } from "node:test";
import assert from "node:assert/strict";
import { checkResult } from "./groq.js";

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
