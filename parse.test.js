import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, afterWake, isStop } from "./parse.js";

const now = new Date(2026, 10, 3, 14, 0); // Tue 3 Nov 2026, 14:00 local
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();

const cases = [
  ["add task buy milk", { type: "task", title: "buy milk", when: null }],
  ["Jarvis, task finish physics homework.", { type: "task", title: "finish physics homework", when: null }],
  ["add call the bank to my tasks", { type: "task", title: "call the bank", when: null }],
  ["add task submit essay by friday", { type: "task", title: "submit essay", when: at(6, 9) }],
  ["remind me to call mom at 5pm", { type: "reminder", title: "call mom", when: at(3, 17) }],
  ["remind me to drink water in 20 minutes", { type: "reminder", title: "drink water", when: at(3, 14, 20) }],
  ["remind me tomorrow at 9 to revise chemistry", { type: "reminder", title: "revise chemistry", when: at(4, 9) }],
  ["add event math exam on friday at 10am", { type: "event", title: "math exam", when: at(6, 10) }],
  ["schedule dentist next monday", { type: "event", title: "dentist", when: at(9, 9) }],
  ["event MUN meeting on 15 november at 6pm", { type: "event", title: "mun meeting", when: at(15, 18) }],
  ["search for population of uzbekistan", { type: "search", title: "population of uzbekistan", when: null }],
  ["Jarvis, look up the speed of light", { type: "search", title: "the speed of light", when: null }],
  ["Who wrote O Captain! My Captain?", { type: "talk", title: "who wrote o captain! my captain", when: null }],
  ["what's the weather in tashkent", { type: "talk", title: "what's the weather in tashkent", when: null }],
  ["Jarvis, how are you doing?", { type: "talk", title: "how are you doing", when: null }],
  ["give me a riddle", { type: "talk", title: "give me a riddle", when: null }],
  ["I'm so tired today", { type: "talk", title: "i'm so tired today", when: null }],
  ["Open YouTube", { type: "open", title: "youtube", when: null, url: "https://www.youtube.com" }],
  ["jarvis open you tube.", { type: "open", title: "you tube", when: null, url: "https://www.youtube.com" }],
  ["go to ozodjonov.com", { type: "open", title: "ozodjonov.com", when: null, url: "https://ozodjonov.com" }],
  ["open khan academy", { type: "open", title: "khan academy", when: null, url: "https://www.google.com/search?q=khan%20academy" }],
  ["play bohemian rhapsody on spotify", { type: "open", title: "bohemian rhapsody on spotify", when: null, url: "https://open.spotify.com/search/bohemian%20rhapsody" }],
  ["search for lofi beats on youtube", { type: "open", title: "lofi beats on youtube", when: null, url: "https://www.youtube.com/results?search_query=lofi%20beats" }],
  ["play interstellar soundtrack", { type: "open", title: "interstellar soundtrack on youtube", when: null, url: "https://www.youtube.com/results?search_query=interstellar%20soundtrack" }],
  ["close tab", { type: "browser", action: "close", title: "close tab", when: null }],
  ["Jarvis, close this tab.", { type: "browser", action: "close", title: "close this tab", when: null }],
  ["next tab", { type: "browser", action: "next", title: "next tab", when: null }],
  ["previous tab", { type: "browser", action: "prev", title: "previous tab", when: null }],
  ["switch to the gmail tab", { type: "browser", action: "switch", title: "gmail", when: null }],
  ["reopen closed tab", { type: "browser", action: "reopen", title: "reopen closed tab", when: null }],
  ["go back", { type: "browser", action: "back", title: "go back", when: null }],
  ["go forward", { type: "browser", action: "forward", title: "go forward", when: null }],
  ["refresh the page", { type: "browser", action: "reload", title: "refresh the page", when: null }],
  ["scroll down", { type: "browser", action: "scrollDown", title: "scroll down", when: null }],
  ["scroll up", { type: "browser", action: "scrollUp", title: "scroll up", when: null }],
  ["scroll to the top", { type: "browser", action: "top", title: "scroll to the top", when: null }],
  ["scroll to bottom", { type: "browser", action: "bottom", title: "scroll to bottom", when: null }],
  ["mute this tab", { type: "browser", action: "mute", title: "mute this tab", when: null }],
  ["unmute tab", { type: "browser", action: "unmute", title: "unmute tab", when: null }],
  ["click sign in", { type: "page", action: "click", title: "click sign in", target: "sign in", text: null, when: null }],
  ["click on the second video", { type: "page", action: "click", title: "click on the second video", target: "the second video", text: null, when: null }],
  ["type hello world in the search box", { type: "page", action: "type", title: "type hello world in the search box", target: "the search box", text: "hello world", when: null }],
  ["search this site for lo-fi beats", { type: "page", action: "siteSearch", title: "search this site for lo-fi beats", target: null, text: "lo-fi beats", when: null }],
  ["summarize this page", { type: "page", action: "summarize", title: "summarize this page", target: null, text: null, when: null }],
  ["what does this page say about pricing", { type: "page", action: "ask", title: "what does this page say about pricing", target: "pricing", text: null, when: null }],
];

for (const [input, want] of cases) test(input, () => assert.deepEqual(parse(input, now), want));

test("reminder without a time falls through", () => assert.equal(parse("remind me to call mom", now), null));
test("unknown command falls through", () => assert.equal(parse("turn off the lights", now), null));
test("empty title falls through", () => assert.equal(parse("remind me at 5pm", now), null));

test("afterWake keeps only what follows the name", () => {
  assert.equal(afterWake("Hey Jarvis, open YouTube"), "open YouTube");
  assert.equal(afterWake("so I was saying jarvis what time is it"), "what time is it");
  assert.equal(afterWake("Jarvis."), "");
  assert.equal(afterWake("what's for dinner"), null);
  assert.equal(afterWake("jarvisville is nice"), null);
});
test("write … in … is chat, not typing on the page", () => assert.equal(parse("write a haiku in spanish", now), null));
test("close <name> closes a tab by name", () => {
  assert.deepEqual(parse("close youtube", now), { type: "browser", action: "closeMatch", title: "youtube", when: null });
  assert.deepEqual(parse("Jarvis, close the Gmail tab.", now), { type: "browser", action: "closeMatch", title: "gmail", when: null });
  assert.equal(parse("close this tab", now).action, "close");
});
test("isStop takes short stop phrases only", () => {
  for (const s of ["stop", "Stop.", "Jarvis, stop", "stop it", "stop talking", "quiet", "be quiet", "shut up", "enough", "that's enough", "okay stop"]) assert.ok(isStop(s), s);
  for (const s of ["stop the music on youtube", "the bus stop is near", "remind me to stop at 5pm", ""]) assert.ok(!isStop(s), s);
});

const media = (action, n) => ({ type: "media", action, ...(n === undefined ? {} : { n }) });
test("video and music commands", () => {
  const want = {
    "pause": media("pause"),
    "pause the video": media("pause"),
    "play": media("play"),
    "resume": media("play"),
    "play the music": media("play"),
    "skip 30 seconds": media("seek", 30),
    "fast forward 2 minutes": media("seek", 120),
    "go back 10 seconds": media("seek", -10),
    "rewind 15 seconds": media("seek", -15),
    "restart the video": media("restart"),
    "volume up": media("volume", 1),
    "turn it down": media("volume", -1),
    "faster": media("speed", 1),
    "slow down": media("speed", -1),
    "normal speed": media("speed", 0),
    "next video": media("next"),
    "skip this song": media("next"),
    "skip ad": media("skipAd"),
    "skip the ads": media("skipAd"),
    "full screen": media("fullscreen"),
    "exit fullscreen": media("fullscreen"),
  };
  for (const [said, w] of Object.entries(want)) {
    const got = parse(said, now);
    assert.deepEqual({ type: got?.type, action: got?.action, ...(got?.n === undefined ? {} : { n: got.n }) }, w, said);
  }
});
test("media rules leave older commands alone", () => {
  assert.equal(parse("go back", now).action, "back");
  assert.equal(parse("play bohemian rhapsody", now).type, "open");
  assert.equal(parse("skip ad", now).type, "media");
});
test("go to the next tab means the next tab", () => {
  assert.equal(parse("go to the next tab", now).action, "next");
  assert.equal(parse("go to the previous tab", now).action, "prev");
});
test("briefing phrases", () => {
  for (const s of ["what's on today", "what do I have today", "briefing", "Jarvis, give me my briefing", "what's my day look like"]) assert.equal(parse(s, now)?.type, "briefing", s);
});
