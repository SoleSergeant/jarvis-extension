import { test } from "node:test";
import assert from "node:assert/strict";
import { bestVoice } from "./voice.js";

const v = (voiceName, lang = "en-US") => ({ voiceName, lang });

test("prefers a Google voice over the robotic Windows one", () =>
  assert.equal(bestVoice([v("Microsoft David - English (United States)"), v("Google US English"), v("Google UK English Male", "en-GB")]), "Google UK English Male"));
test("prefers an English natural voice, ignoring other languages", () =>
  assert.equal(bestVoice([v("Microsoft Madina Online (Natural)", "uz-UZ"), v("Google US English"), v("Microsoft Aria Online (Natural)")]), "Microsoft Aria Online (Natural)"));
test("falls back to any English voice", () => assert.equal(bestVoice([v("Google русский", "ru-RU"), v("Microsoft Zira")]), "Microsoft Zira"));
test("no voices gives undefined (Chrome default)", () => assert.equal(bestVoice([]), undefined));
