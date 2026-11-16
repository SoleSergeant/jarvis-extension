import { test } from "node:test";
import assert from "node:assert/strict";
import { winCommand, pick, timeLine, statusLine, weatherLine, partOfDay } from "./win.js";
import { Segmenter, downsample, encodeWav } from "./mic.js";

test("windows commands", () => {
  assert.deepEqual(winCommand("Jarvis, mute."), { action: "mute" });
  assert.deepEqual(winCommand("set the volume to 30%"), { action: "volume", arg: 30 });
  assert.deepEqual(winCommand("volume 150"), { action: "volume", arg: 100 });
  assert.deepEqual(winCommand("lock my computer"), { action: "lock" });
  assert.deepEqual(winCommand("show desktop"), { action: "desktop" });
  assert.deepEqual(winCommand("shut down the pc"), { action: "shutdown" });
  assert.deepEqual(winCommand("restart my computer"), { action: "restart" });
  assert.deepEqual(winCommand("open my downloads folder"), { action: "folder", arg: "downloads" });
  assert.equal(winCommand("restart"), null); // the video restart, in parse.js
  assert.equal(winCommand("open spotify"), null);
  assert.equal(winCommand("remind me to lock the door at 5pm"), null);
});

test("pick an app by its spoken name", () => {
  const apps = ["Google Chrome", "Spotify", "Uninstall Spotify", "Visual Studio Code", "Telegram Desktop", "Word", "WordPad", "File Explorer"].map((Name) => ({ Name }));
  const name = (spoken) => pick(apps, spoken, (a) => [a.Name])?.Name ?? null;
  assert.equal(name("Spotify"), "Spotify");
  assert.equal(name("chrome"), "Google Chrome");
  assert.equal(name("telegram"), "Telegram Desktop");
  assert.equal(name("vs code"), "Visual Studio Code");
  assert.equal(name("word"), "Word");
  assert.equal(name("files"), "File Explorer");
  assert.equal(name("photoshop"), null);
});

test("segmenter finds one phrase with some lead-in", () => {
  const seg = new Segmenter({ pre: 2, hang: 3, min: 2 });
  const quiet = () => seg.feed("q", 0.001);
  const loud = () => seg.feed("L", 0.2);
  for (let i = 0; i < 10; i++) assert.equal(quiet(), null);
  for (let i = 0; i < 4; i++) assert.equal(loud(), null);
  assert.ok(seg.speaking);
  assert.equal(quiet(), null);
  assert.equal(quiet(), null);
  assert.deepEqual(quiet(), ["q", "q", "L", "L", "L", "L", "q", "q", "q"]);
  assert.ok(!seg.speaking);
});

test("segmenter drops a single click", () => {
  const seg = new Segmenter({ pre: 1, hang: 2, min: 3 });
  seg.feed("q", 0.001);
  seg.feed("L", 0.3);
  seg.feed("q", 0.001);
  assert.equal(seg.feed("q", 0.001), null);
});

test("wav at 16 kHz", () => {
  const x = downsample(new Float32Array(48000).fill(0.5), 48000);
  assert.equal(x.length, 16000);
  const v = new DataView(encodeWav(x));
  assert.equal(v.byteLength, 44 + 32000);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getInt16(44, true), Math.trunc(0.5 * 0x7fff));
});

test("assistant questions", () => {
  assert.deepEqual(winCommand("Jarvis, what time is it?"), { action: "time" });
  assert.deepEqual(winCommand("what's the date today"), { action: "date" });
  assert.deepEqual(winCommand("status report"), { action: "status" });
  assert.deepEqual(winCommand("how's my computer doing"), { action: "status" });
  assert.deepEqual(winCommand("what's the weather like"), { action: "weather" });
  assert.deepEqual(winCommand("good morning jarvis"), { action: "hello" });
  assert.equal(winCommand("what time is the match"), null);
});

test("spoken lines", () => {
  const d = new Date(2026, 10, 15, 20, 5);
  assert.equal(timeLine(d), "It's 8:05 PM on Sunday, November 15.");
  assert.equal(partOfDay(new Date(2026, 0, 1, 9)), "Good morning");
  assert.equal(
    statusLine({ cpu: 0.12, memUsed: 8 * 2 ** 30, memTotal: 16 * 2 ** 30, uptime: 7200, battery: { level: 0.8, charging: true } }),
    "CPU at 12 percent, memory at 50 percent of 16 gigabytes. Battery 80 percent, charging. Up for 2 hours. All systems nominal.",
  );
  const w = { current: { temperature_2m: 4.4, weather_code: 61 }, daily: { temperature_2m_max: [6.2], temperature_2m_min: [1] } };
  assert.equal(weatherLine(w, "Tashkent"), "It's 4 degrees in Tashkent with rain. Today ranges from 1 to 6. A coat would be wise.");
});

test("near misses of the name still wake Jarvis", async () => {
  const { fixWake } = await import("./win.js");
  assert.equal(fixWake("Travis, open Spotify."), "Jarvis, open Spotify.");
  assert.equal(fixWake("jervis what time is it"), "Jarvis what time is it");
  assert.equal(fixWake("open travisty"), "open travisty");
});

test("drops what Whisper itself marks as noise or a guess", async () => {
  const { keepSure } = await import("./mic.js");
  const seg = (text, no_speech_prob, avg_logprob) => ({ text, no_speech_prob, avg_logprob });
  assert.equal(keepSure([seg(" Jarvis, pause.", 0.01, -0.2), seg(" Thank you.", 0.9, -1.0)]), "Jarvis, pause.");
  assert.equal(keepSure([seg(" mumble", 0.1, -1.6)]), "");
  assert.equal(keepSure(undefined, " plain "), "plain");
});
