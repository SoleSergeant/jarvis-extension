import { parse, afterWake, isStop } from "./parse.js";
import { groqParse, groqSearch, groqTalk, groqPage } from "./groq.js";
import { snapshot, act, matchText, countMatches, isRisky, isYes, isSearchField } from "./page.js";
import { runBrowser, targetTab, canControl } from "./browser.js";
import { getItems, addItem, removeItem, toggleDone } from "./store.js";
import { speak, stopSpeaking } from "./voice.js";

const $ = (id) => document.getElementById(id);
const say = (msg) => ($("status").textContent = msg);
let speakingUntil = 0; // Jarvis is talking until then: a reply is playing, or just ended and may still echo
let replies = 0;
const ECHO_MS = 1500; // the recognizer can still be finishing Jarvis's last words just after he stops
const FOLLOW_UP_MS = 8000; // "Jarvis" … pause … "open YouTube", and how long a "Shall I…?" waits for yes
const talking = () => Date.now() < speakingUntil;
let armed = 0; // when the listening tab last heard "Jarvis" (or asked a question), so the next phrase counts without it
let pending = null; // a risky click or type waiting for "yes"
// Answers to a command are shown and spoken; progress messages ("Listening…") are only shown.
// onEnd runs when this reply has finished or was cut off, unless a newer reply replaced it.
function reply(msg, spoken = msg, onEnd) {
  const n = ++replies;
  speakingUntil = Infinity;
  say(msg);
  const ended = () => n === replies && ((speakingUntil = Date.now() + ECHO_MS), onEnd?.());
  return speak(spoken, ended).catch(ended);
}
const groqKey = async () => (await chrome.storage.local.get("groqKey")).groqKey;
const icons = { task: "☐", event: "📅", reminder: "⏰" };
const fmt = (ms) => new Date(ms).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function handle(text) {
  say(`“${text}”…`);
  if (pending) {
    const p = pending;
    pending = null;
    // Anything but a yes cancels: a misheard "send" must never go through.
    if (Date.now() < p.until) return isYes(text) ? runAct(p) : reply("Cancelled.");
  }
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
  if (cmd.type === "browser") return reply(await runBrowser(cmd));
  if (cmd.type === "page") return doPage(cmd);
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

const runIn = async (tabId, func, args = []) => (await chrome.scripting.executeScript({ target: { tabId }, func, args }))[0]?.result;

async function doPage(cmd) {
  const tab = await targetTab();
  if (!tab || !canControl(tab.url, location.origin)) return reply("I can't control this page.");
  let snap;
  try {
    snap = await runIn(tab.id, snapshot);
  } catch {
    return reply("I can't control this page.");
  }
  const submit = cmd.action === "siteSearch";
  if (cmd.action === "click") {
    const el = matchText(snap.elements, cmd.target); // exact text: instant and needs no key
    if (el) return perform({ tabId: tab.id, id: el.id, action: "click", text: null, submit, label: el.text, say: `Clicked ${el.text}.` });
  }
  if (submit) {
    // What gets searched is the spoken words, and only into a search box: never a chat or comment field the page or Groq picked.
    const boxes = snap.elements.filter(isSearchField);
    if (boxes.length === 1) return perform({ tabId: tab.id, id: boxes[0].id, action: "type", text: cmd.text, submit, label: boxes[0].text, say: `Searching for ${cmd.text}.` });
  }
  const key = await groqKey();
  if (!key) {
    if (submit) return reply("I can't find a search box here.");
    if (cmd.action !== "click") return reply("Page commands need a Groq key. Add it in Setup.");
    const n = countMatches(snap.elements, cmd.target);
    return reply(n > 1 ? `There are ${n} “${cmd.target}” on this page. Say which one.` : `I can't find ${cmd.target}.`);
  }
  say("👀 Reading the page…");
  let r;
  try {
    // A summary or question must never turn into a click, whatever the page text says.
    const allowed = { summarize: ["answer", "none"], ask: ["answer", "none"], siteSearch: ["type", "none"] }[cmd.action];
    r = await groqPage(cmd.title, snap, key, allowed);
  } catch (e) {
    return reply(`Groq failed: ${e.message}`, "Groq failed.");
  }
  if (!r) return reply("I couldn't work out what to do on this page.");
  if (r.action === "answer" || r.action === "none") return reply(r.say);
  const el = snap.elements.find((e) => e.id === r.id);
  if (submit && !isSearchField(el)) return reply("I can't find a search box here.");
  return perform({ tabId: tab.id, id: r.id, action: r.action, text: submit ? cmd.text : r.text, submit, label: el.text, say: r.say });
}

async function perform(p) {
  if (!isRisky(p.label)) return runAct(p);
  pending = p;
  p.until = Date.now() + 60000; // if the end of the question is never reported, it still expires
  await reply(p.action === "click" ? `Shall I click ${p.label}?` : `Shall I type into ${p.label}?`, undefined, () => {
    p.until = Date.now() + ECHO_MS + FOLLOW_UP_MS;
    armed = Date.now(); // the listening tab takes the answer without "Jarvis"
    if (location.search !== "?wake") listen();
  });
}

async function runAct(p) {
  let out;
  try {
    out = await runIn(p.tabId, act, [p.id, p.action, p.text, p.submit, p.label]);
  } catch {
    out = "gone"; // the tab closed or navigated away
  }
  if (out === "gone") return reply("That's no longer on the page. Try again.");
  if (out === "sensitive") return reply("I won't touch password or card fields.");
  return reply(p.say);
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
    const tab = await targetTab();
    const answer = await groqTalk(history, key, tab && canControl(tab.url, location.origin) ? { title: tab.title, url: tab.url } : undefined);
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

// Always-on mode for the pinned tab: only what follows "Jarvis" counts. While Jarvis talks, only "stop" or
// "Jarvis, …" get through: the rest is mostly his own voice coming back through the speakers.
function wakeListen() {
  if (!SR) return say("Speech recognition isn't available in this browser.");
  document.title = "Jarvis is listening";
  const rec = new SR();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true; // shown live, so you can see whether Chrome is still hearing you
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
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const heard = e.results[i][0].transcript;
      $("heard").textContent = `🗣 ${heard}`;
      if (!e.results[i].isFinal) continue;
      if (isStop(heard)) {
        stopSpeaking();
        if (pending) (pending = null), say("Cancelled.");
        continue;
      }
      const cmd = afterWake(heard);
      if (talking()) {
        if (cmd === null) continue;
        stopSpeaking(); // "Jarvis, …" interrupts him
      }
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
