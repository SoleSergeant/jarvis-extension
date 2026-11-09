import { test } from "node:test";
import assert from "node:assert/strict";
import { bestVoice, chunks, greet } from "./voice.js";

test("short text stays one piece", () => assert.deepEqual(chunks("O Captain, my Captain. Saved task: buy milk"), ["O Captain, my Captain. Saved task: buy milk"]));
test("long text splits at sentence ends, each piece within 200 characters", () => {
  const s = "Mount Everest is the highest mountain on Earth above sea level. ".repeat(5);
  const out = chunks(s);
  assert.ok(out.length > 1 && out.every((c) => c.length <= 200 && c.endsWith(".")));
  assert.equal(out.join(" "), s.trim());
});
test("one sentence over 200 characters splits at spaces", () => {
  const out = chunks("word ".repeat(80).trim());
  assert.ok(out.length === 2 && out.every((c) => c.length <= 200));
  assert.equal(out.join(" ").split(" ").length, 80);
});

const v = (voiceName, lang = "en-US") => ({ voiceName, lang });

test("prefers a Google voice over the robotic Windows one", () =>
  assert.equal(bestVoice([v("Microsoft David - English (United States)"), v("Google US English"), v("Google UK English Male", "en-GB")]), "Google UK English Male"));
test("prefers an English natural voice, ignoring other languages", () =>
  assert.equal(bestVoice([v("Microsoft Madina Online (Natural)", "uz-UZ"), v("Google US English"), v("Microsoft Aria Online (Natural)")]), "Microsoft Aria Online (Natural)"));
test("falls back to any English voice", () => assert.equal(bestVoice([v("Google русский", "ru-RU"), v("Microsoft Zira")]), "Microsoft Zira"));
test("no voices gives undefined (Chrome default)", () => assert.equal(bestVoice([]), undefined));

const MIN = 60 * 1000;
test("greets with the Captain line only after a pause", () => {
  assert.equal(greet("Scrolled down.", undefined, 0), "O Captain, my Captain. Scrolled down.");
  assert.equal(greet("Scrolled down.", 0, 11 * MIN), "O Captain, my Captain. Scrolled down.");
  assert.equal(greet("Scrolled down.", 0, 2 * MIN), "Scrolled down.");
});
