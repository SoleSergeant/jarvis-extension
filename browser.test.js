import { test } from "node:test";
import assert from "node:assert/strict";
import { canControl, pickTab } from "./browser.js";

const ext = "chrome-extension://abc";
test("canControl allows normal web pages and files", () => {
  assert.ok(canControl("https://www.youtube.com/watch?v=1", ext));
  assert.ok(canControl("file:///C:/notes.html", ext));
});
test("canControl refuses Chrome's own pages, the Web Store and Jarvis", () => {
  assert.ok(!canControl("chrome://extensions", ext));
  assert.ok(!canControl("about:blank", ext));
  assert.ok(!canControl("https://chromewebstore.google.com/detail/x", ext));
  assert.ok(!canControl("https://chrome.google.com/webstore/detail/x", ext));
  assert.ok(!canControl("chrome-extension://abc/popup.html?wake", ext));
  assert.ok(!canControl(undefined, ext));
});
test("pickTab matches all words in the title", () =>
  assert.equal(pickTab([{ id: 1, title: "Inbox - Gmail" }, { id: 2, title: "YouTube" }], "gmail inbox").id, 1));
test("pickTab returns null when nothing matches", () => assert.equal(pickTab([{ id: 2, title: "YouTube" }], "gmail"), null));
