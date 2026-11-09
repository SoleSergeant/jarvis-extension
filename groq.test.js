import { test } from "node:test";
import assert from "node:assert/strict";
import { checkResult, cleanAnswer, checkPage } from "./groq.js";

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

const snap = {
  elements: [
    { id: 4, role: "link", text: "Video", sensitive: false },
    { id: 5, role: "input password", text: "Password", sensitive: true },
  ],
};
test("checkPage keeps a valid click", () =>
  assert.deepEqual(checkPage({ action: "click", id: 4, say: "Opening the video." }, snap), { action: "click", id: 4, text: null, say: "Opening the video." }));
test("checkPage keeps an answer without an id", () =>
  assert.deepEqual(checkPage({ action: "answer", id: 4, text: "x", say: "It's a **video** site.【1】" }, snap), { action: "answer", id: null, text: null, say: "It's a video site." }));
test("checkPage rejects unknown ids", () => assert.equal(checkPage({ action: "click", id: 99, say: "ok" }, snap), null));
test("checkPage rejects sensitive targets", () => assert.equal(checkPage({ action: "type", id: 5, text: "x", say: "ok" }, snap), null));
test("checkPage rejects unknown actions and empty say", () => {
  assert.equal(checkPage({ action: "delete", id: 4, say: "ok" }, snap), null);
  assert.equal(checkPage({ action: "answer", say: "" }, snap), null);
  assert.equal(checkPage(null, snap), null);
});
test("checkPage needs text to type", () => assert.equal(checkPage({ action: "type", id: 4, say: "ok" }, snap), null));
test("checkPage only allows the actions the command permits", () => {
  assert.equal(checkPage({ action: "click", id: 4, say: "ok" }, snap, ["answer", "none"]), null);
  assert.equal(checkPage({ action: "answer", say: "It is a video." }, snap, ["answer", "none"]).action, "answer");
});
