import { parse } from "./parse.js";
import { groqParse, groqSearch } from "./groq.js";
import { getItems, addItem, removeItem, toggleDone } from "./store.js";
import { speak } from "./voice.js";

const $ = (id) => document.getElementById(id);
const say = (msg) => ($("status").textContent = msg);
// Answers to a command are shown and spoken; progress messages ("Listening…") are only shown.
const reply = (msg, spoken = msg) => (say(msg), speak(spoken));
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
    if (!cmd) return reply(hint, "I didn't get that.");
  }
  if (cmd.type === "search") return search(cmd.title);
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
    reply(`Opening a Google search for “${query}”.`);
    return chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
  }
  say(`🔎 Searching: ${query}…`);
  try {
    reply(await groqSearch(query, key));
  } catch (e) {
    reply(`Search failed: ${e.message}`, "The search failed.");
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

$("mic").onclick = listen;
$("typed").onsubmit = (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  if (text) handle(text).then(() => ($("text").value = ""));
};
render();
listen();
