import { parse } from "./parse.js";
import { groqParse } from "./groq.js";
import { getItems, addItem, removeItem, toggleDone } from "./store.js";

const $ = (id) => document.getElementById(id);
const say = (msg) => ($("status").textContent = msg);
const icons = { task: "☐", event: "📅", reminder: "⏰" };
const fmt = (ms) => new Date(ms).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function handle(text) {
  say(`“${text}”…`);
  let cmd = parse(text);
  if (!cmd) {
    const { groqKey } = await chrome.storage.local.get("groqKey");
    if (!groqKey) return say(`Didn't get “${text}”. Try: “remind me to… at 5pm”, “add task…”, “event… on Friday at 10”.`);
    try {
      cmd = await groqParse(text, groqKey);
    } catch (e) {
      return say(`Groq failed, nothing saved: ${e.message}`);
    }
    if (!cmd) return say(`Didn't get “${text}”. Nothing saved.`);
  }
  if (cmd.when && cmd.type !== "task" && cmd.when <= Date.now()) return say(`${fmt(cmd.when)} has already passed. Nothing saved.`);
  await addItem(cmd);
  say(`${icons[cmd.type]} Saved ${cmd.type}: ${cmd.title}${cmd.when ? ` · ${fmt(cmd.when)}` : ""}`);
  render();
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
    } else if (e.error === "no-speech") say("Didn't catch that. Click 🎙 to try again.");
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
