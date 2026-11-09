import { test } from "node:test";
import assert from "node:assert/strict";
import { matchText, countMatches, isRisky, isYes, isSearchField } from "./page.js";

const els = [
  { id: 1, role: "button", text: "Sign In →", sensitive: false },
  { id: 2, role: "button", text: "Reply", sensitive: false },
  { id: 3, role: "button", text: "Reply", sensitive: false },
];
test("matchText ignores case and punctuation", () => assert.equal(matchText(els, "sign in").id, 1));
test("matchText refuses duplicates", () => {
  assert.equal(matchText(els, "reply"), null);
  assert.equal(countMatches(els, "reply"), 2);
});
test("matchText finds nothing for unknown words", () => assert.equal(matchText(els, "settings"), null));
test("isRisky", () => {
  assert.ok(isRisky("Send now"));
  assert.ok(isRisky("Log out"));
  assert.ok(isRisky("PLACE ORDER"));
  assert.ok(!isRisky("Sender settings"));
  assert.ok(!isRisky("Home"));
});
test("isYes", () => {
  assert.ok(isYes("yes please"));
  assert.ok(isYes("Go ahead."));
  assert.ok(!isYes("no"));
  assert.ok(!isYes("click home"));
  assert.ok(!isYes("yesterday"));
});

test("isYes needs the whole reply to be a yes", () => {
  assert.ok(isYes("Yes."));
  assert.ok(isYes("yes please"));
  assert.ok(!isYes("do it later"));
  assert.ok(!isYes("go ahead and cancel"));
  assert.ok(!isYes("yes— no wait"));
  assert.ok(!isYes("sure, but not that one"));
});
test("isSearchField spots search boxes only", () => {
  assert.ok(isSearchField({ role: "input search", text: "" }));
  assert.ok(isSearchField({ role: "input text", text: "Search this site" }));
  assert.ok(!isSearchField({ role: "textarea", text: "Message" }));
  assert.ok(!isSearchField({ role: "link", text: "Search tips" }));
});
