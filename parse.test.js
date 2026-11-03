import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./parse.js";

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
  ["Who wrote O Captain! My Captain?", { type: "search", title: "who wrote o captain! my captain", when: null }],
  ["what's the weather in tashkent", { type: "search", title: "what's the weather in tashkent", when: null }],
  ["Open YouTube", { type: "open", title: "youtube", when: null, url: "https://www.youtube.com" }],
  ["jarvis open you tube.", { type: "open", title: "you tube", when: null, url: "https://www.youtube.com" }],
  ["go to ozodjonov.com", { type: "open", title: "ozodjonov.com", when: null, url: "https://ozodjonov.com" }],
  ["open khan academy", { type: "open", title: "khan academy", when: null, url: "https://www.google.com/search?q=khan%20academy" }],
  ["play bohemian rhapsody on spotify", { type: "open", title: "bohemian rhapsody on spotify", when: null, url: "https://open.spotify.com/search/bohemian%20rhapsody" }],
  ["search for lofi beats on youtube", { type: "open", title: "lofi beats on youtube", when: null, url: "https://www.youtube.com/results?search_query=lofi%20beats" }],
  ["play interstellar soundtrack", { type: "open", title: "interstellar soundtrack on youtube", when: null, url: "https://www.youtube.com/results?search_query=interstellar%20soundtrack" }],
];

for (const [input, want] of cases) test(input, () => assert.deepEqual(parse(input, now), want));

test("reminder without a time falls through", () => assert.equal(parse("remind me to call mom", now), null));
test("unknown command falls through", () => assert.equal(parse("turn off the lights", now), null));
test("empty title falls through", () => assert.equal(parse("remind me at 5pm", now), null));
