import { parse, afterWake } from "./parse.js";
import { groqParse, groqSearch, groqTalk } from "./groq.js";
import { getItems, addItem, removeItem, toggleDone } from "./store.js";
import { speak } from "./voice.js";

const $ = (id) => document.getElementById(id);
const say = (msg) => ($("status").textContent = msg);
let deafUntil = 0;
// Answers to a command are shown and spoken; progress messages ("Listening…") are only shown.
// shortcut: speak() has no end signal, so the listening tab guesses how long the reply lasts; use a real signal if it cuts you off.
const reply = (msg, spoken = msg) => ((deafUntil = Date.now() + 3000 + spoken.length * 70), say(msg), speak(spoken));
const groqKey = async () => (await chrome.storage.local.get("groqKey")).groqKey;
const icons = { task: "☐", event: "📅", reminder: "⏰" };
const fmt = (ms) => new Date(ms).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function handle(text) {
  say(`“${text}”…`);
  let cmd = parse(text);
  if (!cmd) {
    const key = await groqKey();
    const hint = `Didn't get “${text}”. Try: “remind me to… at 5pm”, “add task…”, “event… on Friday at 10”, “search…”.`;
    if (!key) return reply(hint, "I didn't get that.");
    try {
      cmd = await groqParse(text, key);
    } catch (e) {
      return reply(`Groq failed, nothing saved: ${e.message}`, "Groq failed. Nothing saved.");
    }
    if (!cmd) return talk(text);
  }
  if (cmd.type === "search") return search(cmd.title);
  if (cmd.type === "talk") return talk(text);
  if (cmd.type === "open") {
    // Speak first: the new tab takes focus and closes the popup.
    await reply(`Opening ${cmd.title}.`);
    return chrome.tabs.create({ url: cmd.url });
  }
  if (cmd.when && cmd.type !== "task" && cmd.when <= Date.now()) return reply(`${fmt(cmd.when)} has already passed. Nothing saved.`);
  await addItem(cmd);
  const saved = `Saved ${cmd.type}: ${cmd.title}${cmd.when ? `, ${fmt(cmd.when)}` : ""}`;
  reply(`${icons[cmd.type]} ${saved}`, saved);
  render();
}

async function search(query) {
  const key = await groqKey();
  if (!key) {
    // Speak before opening the tab: the new tab takes focus and closes the popup.
    await reply(`Opening a Google search for “${query}”.`);
    return chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
  }
  say(`🔎 Searching: ${query}…`);
  try {
    reply(await groqSearch(query, key));
  } catch (e) {
    reply(`Search failed: ${e.message}`, "The search failed.");
  }
}

const MEMORY_MS = 10 * 60 * 1000;
// Recent lines live in session storage so "what's the answer?" works after reopening the popup; Chrome clears it on exit.
async function talk(text) {
  const key = await groqKey();
  if (!key) return search(text); // no key: fall back to a Google tab, as before
  const { chat } = await chrome.storage.session.get("chat");
  const history = chat && Date.now() - chat.at < MEMORY_MS ? chat.history : [];
  history.push({ role: "user", content: text });
  say("💬 …");
  try {
    const answer = await groqTalk(history, key);
    history.push({ role: "assistant", content: answer });
    await chrome.storage.session.set({ chat: { at: Date.now(), history: history.slice(-10) } });
    reply(answer);
  } catch (e) {
    reply(`Groq failed: ${e.message}`, "Sorry, I couldn't think of a reply.");
  }
}

async function render() {
  const items = (await getItems()).sort((a, b) => a.done - b.done || (a.when ?? Infinity) - (b.when ?? Infinity));
  $("list").replaceChildren(
    ...items.map((i) => {
      const li = document.createElement("li");
      li.className = i.done ? "done" : "";
      li.innerHTML = `<button data-act="done" aria-label="Toggle done">${i.done ? "☑" : icons[i.type]}</button>
        <span class="title"></span><span class="meta"></span><button data-act="del" aria-label="Delete">✕</button>`;
      li.querySelector(".title").textContent = i.title; // textContent: titles come from speech/Groq, never as HTML
      li.querySelector(".meta").textContent = i.when ? fmt(i.when) : "";
      li.querySelector('[data-act="done"]').onclick = () => toggleDone(i.id).then(render);
      li.querySelector('[data-act="del"]').onclick = () => removeItem(i.id).then(render);
      return li;
    }),
  );
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen() {
  if (!SR) return say("Speech recognition isn't available in this browser. Type instead.");
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.onstart = () => ($("mic").classList.add("on"), say("Listening…"));
  rec.onend = () => $("mic").classList.remove("on");
  rec.onresult = (e) => {
    const r = e.results[e.results.length - 1];
    if (r.isFinal) handle(r[0].transcript);
    else say(`“${r[0].transcript}”`);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed") {
      say("Microphone not allowed yet. Opening setup…");
      chrome.runtime.openOptionsPage();
    } else if (e.error === "no-speech") reply("Didn't catch that. Click 🎙 to try again.", "I didn't catch that.");
    else say(`Mic error: ${e.error}`);
  };
  rec.start();
}

const FOLLOW_UP_MS = 8000; // "Jarvis" … pause … "open YouTube"
// Always-on mode for the pinned tab: only what follows "Jarvis" counts, and Jarvis's own voice is ignored.
function wakeListen() {
  if (!SR) return say("Speech recognition isn't available in this browser.");
  document.title = "Jarvis is listening";
  const rec = new SR();
  rec.lang = "en-US";
  rec.continuous = true;
  let armed = 0;
  let retryMs = 500;
  rec.onstart = () => {
    retryMs = 500;
    $("mic").classList.add("on");
    say("Say “Jarvis”, then your command.");
  };
  rec.onend = () => {
    $("mic").classList.remove("on");
    setTimeout(() => rec.start(), retryMs); // Chrome ends sessions on its own, so keep restarting
  };
  rec.onresult = (e) => {
    if (Date.now() < deafUntil) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (!e.results[i].isFinal) continue;
      const heard = e.results[i][0].transcript;
      const cmd = afterWake(heard);
      if (cmd === "") armed = Date.now();
      else if (cmd) handle(cmd);
      else if (Date.now() - armed < FOLLOW_UP_MS) handle(heard);
      else continue;
      if (cmd !== "") armed = 0;
    }
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      rec.onend = null;
      return say("Microphone not allowed. Allow it in Setup, then reload this tab.");
    }
    // Long wait on "aborted": Alt+J's popup took the mic, and restarting now would cut it off.
    if (e.error !== "no-speech") (retryMs = 15000), say(`Mic paused: ${e.error}`);
  };
  rec.start();
}

$("mic").onclick = listen;
$("typed").onsubmit = (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  if (text) handle(text).then(() => ($("text").value = ""));
};
render();
if (location.search === "?wake") {
  // The lock leaves one listener running: two tabs would keep stealing the mic from each other.
  navigator.locks.request("jarvis-wake", { ifAvailable: true }, (lock) => {
    if (!lock) return chrome.tabs.getCurrent((tab) => chrome.tabs.remove(tab.id));
    wakeListen();
    return new Promise(() => {}); // held until this tab closes
  });
} else listen();
