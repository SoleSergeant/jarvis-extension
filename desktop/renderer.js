// The orb's brain: the extension's parser, Groq and voice, plus Windows commands. Adapted from ../popup.js.
import { parse, afterWake, isStop } from "../parse.js";
import { groqParse, groqSearch, cleanAnswer } from "../groq.js";
import { isYes } from "../page.js";
import { briefing } from "../briefing.js";
import { getItems, addItem, removeItem, toggleDone } from "../store.js";
import { speak, stopSpeaking, AI_VOICES, getVoices } from "../voice.js";
import { winCommand, CONFIRM, timeLine, partOfDay, statusLine, weatherLine, ack } from "./win.js";
import { startMic, transcribe } from "./mic.js";

const $ = (id) => document.getElementById(id);
let open = false;
let lastActive = Date.now();
const say = (msg) => ((lastActive = Date.now()), ($("status").textContent = msg));
let speakingUntil = 0; // Jarvis is talking until then: a reply is playing, or just ended and may still echo
let replies = 0;
const ECHO_MS = 1500; // the microphone can still be catching his last words just after he stops
const FOLLOW_UP_MS = 8000; // "Jarvis" … pause … "open notepad", and how long a "Shall I…?" waits for yes
const talking = () => Date.now() < speakingUntil;
let armed = 0; // when "Jarvis" (or Ctrl+Alt+J, or a question) last came, so the next phrase counts without the name
let pending = null; // a shutdown/restart/sleep waiting for "yes"

function reply(msg, spoken = msg, onEnd) {
  const n = ++replies;
  speakingUntil = Infinity;
  document.body.classList.add("talking");
  expand(true);
  say(msg);
  const ended = () => n === replies && ((speakingUntil = Date.now() + ECHO_MS), document.body.classList.remove("talking"), onEnd?.());
  return speak(spoken, ended).catch(ended);
}
const groqKey = async () => (await chrome.storage.local.get("groqKey")).groqKey;
const win = (action, arg) => window.jarvis.win({ action, arg });
const icons = { task: "☐", event: "📅", reminder: "⏰" };
const fmt = (ms) => new Date(ms).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const EXTENSION = "That one lives in the Chrome extension, I'm afraid. Press Alt+J in Chrome.";

async function handle(text) {
  say(`“${text}”…`);
  if (pending) {
    const p = pending;
    pending = null;
    // Anything but a yes cancels: a misheard "shut down" must never go through.
    if (Date.now() < p.until) return isYes(text) ? doWin(p.cmd, true) : reply("Very well, cancelled.");
  }
  const w = winCommand(text);
  if (w) return doWin(w);
  let cmd = parse(text);
  if (!cmd) {
    const key = await groqKey();
    if (!key) return reply(`Didn't get “${text}”. Try: “open notepad”, “set volume to 30”, “remind me to… in 10 minutes”.`, "I didn't quite catch that.");
    try {
      cmd = await groqParse(text, key);
    } catch (e) {
      return reply(`Groq failed, nothing saved: ${e.message}`, "My connection to Groq failed. Nothing saved.");
    }
    if (!cmd) return talk(text);
  }
  try {
    if (cmd.type === "media") return await media(cmd);
    if (cmd.type === "browser") {
      if (cmd.action !== "closeMatch") return reply(EXTENSION);
      const name = await win("closeApp", cmd.title);
      return reply(name ? `Closing ${name}.` : `No app called ${cmd.title} is open. Closing tabs is the Chrome extension's job.`);
    }
    if (cmd.type === "page") return reply(EXTENSION);
    if (cmd.type === "briefing") return reply(briefing(await getItems()));
    if (cmd.type === "search") return search(cmd.title);
    if (cmd.type === "talk") return talk(text);
    if (cmd.type === "open") {
      // "open notepad" is an app; "open github.com" or "cats on youtube" is the web.
      const app = /\.| on /.test(cmd.title) ? null : await win("openApp", cmd.title);
      if (app) return reply(`Opening ${app}.`);
      await win("url", cmd.url);
      return reply(`Opening ${cmd.title}.`);
    }
  } catch (e) {
    return reply(`That didn't work: ${e.message}`, "That didn't work, I'm afraid.");
  }
  if (cmd.when && cmd.type !== "task" && cmd.when <= Date.now()) return reply(`${fmt(cmd.when)} has already passed. Nothing saved.`);
  await addItem(cmd);
  const saved = `Saved ${cmd.type}: ${cmd.title}${cmd.when ? `, ${fmt(cmd.when)}` : ""}`;
  reply(`${icons[cmd.type]} ${saved}`, saved);
  render();
}

// Video and music: the keyboard's media keys reach whatever is playing, in any app.
async function media(cmd) {
  const keys = { play: "play", pause: "play", next: "next" }[cmd.action];
  if (keys) return await win(keys), say(`⏯ ${ack()}`);
  if (cmd.action === "volume") return await win(cmd.n > 0 ? "louder" : "quieter"), say(cmd.n > 0 ? "🔊 Louder." : "🔉 Quieter.");
  return reply(EXTENSION);
}

async function doWin(cmd, confirmed = false) {
  const { action, arg } = cmd;
  if (CONFIRM[action] && !confirmed) {
    const p = { cmd, until: Date.now() + 60000 }; // if the end of the question is never reported, it still expires
    pending = p;
    return reply(`Shall I ${CONFIRM[action]}?`, undefined, () => ((p.until = Date.now() + ECHO_MS + FOLLOW_UP_MS), (armed = Date.now())));
  }
  try {
    switch (action) {
      case "time":
      case "date":
        return reply(timeLine(new Date()));
      case "hello":
        return greet();
      case "status":
        return reply(statusLine({ ...(await win("status")), battery: await battery() }));
      case "weather":
        return reply(await weather());
      case "volume":
        await win("volume", arg);
        return say(`🔊 Volume ${arg}%.`);
      case "mute":
      case "prev":
        await win(action);
        return say(action === "mute" ? "🔇 Mute toggled." : "⏮ Previous track.");
      case "folder":
        await win("folder", arg);
        return reply(`Opening ${arg}.`);
      default: // lock, desktop, shutdown, restart, sleep
        await reply({ shutdown: "Shutting down.", restart: "Restarting.", sleep: "Goodnight." }[action] ?? ack());
        return win(action);
    }
  } catch (e) {
    return reply(`That didn't work: ${e.message}`, "That didn't work, I'm afraid.");
  }
}

async function battery() {
  const b = await navigator.getBattery?.().catch(() => null);
  return b && !(b.charging && b.level === 1 && b.chargingTime === 0) ? { level: b.level, charging: b.charging } : undefined; // a desktop reports a full, charging "battery"
}

async function weather() {
  try {
    let { loc } = await chrome.storage.session.get("loc");
    if (!loc) {
      const g = await (await fetch("https://get.geojs.io/v1/ip/geo.json")).json(); // rough location from the IP address, no key needed
      loc = { lat: Number(g.latitude), lon: Number(g.longitude), city: typeof g.city === "string" ? g.city : "" };
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) throw new Error("no location");
      await chrome.storage.session.set({ loc });
    }
    const q = `latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    return weatherLine(await (await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)).json(), loc.city);
  } catch {
    return "I can't reach the weather service just now.";
  }
}

// The morning (or evening) report: time, weather and what's on today.
async function greet() {
  const [w, items] = await Promise.all([weather(), getItems()]);
  return reply(`${partOfDay(new Date())}. ${timeLine(new Date())} ${w} ${briefing(items)}`);
}

async function search(query) {
  const key = await groqKey();
  if (!key) {
    await win("url", `https://www.google.com/search?q=${encodeURIComponent(query)}`);
    return reply(`Opening a Google search for “${query}”.`);
  }
  say(`🔎 Searching: ${query}…`);
  try {
    reply(await groqSearch(query, key));
  } catch (e) {
    reply(`Search failed: ${e.message}`, "The search failed, I'm afraid.");
  }
}

const PERSONA = `You are Jarvis, an AI butler living on the user's Windows PC: calm, impeccably polite, quietly capable, with a dry British wit and the odd gentle bit of sarcasm. You are talking by voice to a busy student.
Reply in one to three short sentences that sound natural read aloud. No lists, links, emoji or markdown. Don't address them by name or title; that is added for you.
Play along with riddles, jokes and small talk; for a riddle, don't give the answer until asked. Search the web only for facts that may have changed.`;
const MEMORY_MS = 10 * 60 * 1000;
async function talk(text) {
  const key = await groqKey();
  if (!key) return search(text);
  const { chat } = await chrome.storage.session.get("chat");
  const history = chat && Date.now() - chat.at < MEMORY_MS ? chat.history : [];
  history.push({ role: "user", content: text });
  say("💬 …");
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        reasoning_effort: "low",
        tools: [{ type: "browser_search" }],
        tool_choice: "auto",
        messages: [{ role: "system", content: `${PERSONA}\nLocal time: ${new Date().toString()}.` }, ...history],
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const answer = cleanAnswer((await res.json()).choices?.[0]?.message?.content);
    if (!answer) throw new Error("empty answer");
    history.push({ role: "assistant", content: answer });
    await chrome.storage.session.set({ chat: { at: Date.now(), history: history.slice(-10) } });
    reply(answer);
  } catch (e) {
    reply(`Groq failed: ${e.message}`, "Sorry, I seem to have lost my train of thought.");
  }
}

// ---- Reminders ----
chrome.alarms.onAlarm.addListener(async ({ name }) => {
  const item = (await getItems()).find((i) => i.id === name);
  if (!item || item.done) return;
  const title = item.type === "event" ? "Event now" : "Reminder";
  const n = new Notification(title, { body: item.title, requireInteraction: true });
  n.onclick = () => expand(true);
  reply(`${title}: ${item.title}`);
});
// Timers die with the app: set them again for everything still ahead.
for (const i of await getItems()) if (i.when > Date.now() && i.type !== "task" && !i.done) chrome.alarms.create(i.id, { when: i.when });

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

// ---- Listening: Whisper writes down each phrase; only what follows "Jarvis" counts. ----
let wakeOn = false;
let mic = null;
const micWanted = () => wakeOn || !!pending || Date.now() - armed < FOLLOW_UP_MS;
// Whisper invents these from silence and noise.
const GHOST = /^(?:thank you\.?|thanks for watching!?|you|bye\.?|\.+|)$/i;

async function ensureMic() {
  if (mic) return mic.setOn(micWanted());
  const key = await groqKey();
  if (!key) return say("Listening needs a Groq key: add it under Setup. Typing works without one.");
  try {
    mic = await startMic(onPhrase, (on) => document.body.classList.toggle("hearing", on));
  } catch (e) {
    return say(`Microphone unavailable: ${e.message}`);
  }
}

async function onPhrase(wav) {
  const key = await groqKey();
  if (!key) return;
  let heard;
  try {
    heard = await transcribe(wav, key);
  } catch (e) {
    return say(`Listening failed: ${e.message}`);
  }
  if (GHOST.test(heard.trim())) return;
  $("heard").textContent = `🗣 ${heard}`;
  if (isStop(heard)) {
    stopSpeaking();
    if (pending) (pending = null), say("Cancelled.");
    return;
  }
  const cmd = afterWake(heard);
  if (talking()) {
    if (cmd === null) return; // mostly his own voice coming back through the speakers
    stopSpeaking(); // "Jarvis, …" interrupts him
  }
  if (cmd === "") {
    armed = Date.now();
    return reply("Yes?", undefined, () => (armed = Date.now()));
  }
  if (cmd) handle(cmd);
  else if (Date.now() - armed < FOLLOW_UP_MS || pending) handle(heard);
  else return;
  armed = 0;
}
setInterval(() => mic?.setOn(micWanted()), 1000);

async function setWake(on) {
  wakeOn = on;
  await chrome.storage.local.set({ wake: on });
  $("wake").checked = on;
  win("wake", on);
  ensureMic();
}

// ---- The orb and its panel ----
async function expand(want) {
  if (want) lastActive = Date.now();
  if (want === open) return;
  open = want;
  document.body.classList.toggle("open", open);
  await window.jarvis.expand(open);
}
// Folds back into the orb when nothing has happened for a while.
setInterval(() => {
  const busy = talking() || document.querySelector(".panel:hover") || document.activeElement?.matches("input, select");
  if (open && !busy && Date.now() - lastActive > 25000) expand(false);
}, 2000);

// Drag the orb anywhere; a press that barely moves is still a click.
let drag = null;
let dragged = false;
$("orb").onpointerdown = (e) => {
  drag = { x: e.screenX, y: e.screenY };
  dragged = false;
  $("orb").setPointerCapture(e.pointerId);
};
$("orb").onpointermove = (e) => {
  if (!drag) return;
  const dx = e.screenX - drag.x;
  const dy = e.screenY - drag.y;
  if (!dragged && Math.hypot(dx, dy) < 5) return;
  dragged = true;
  drag = { x: e.screenX, y: e.screenY };
  win("move", { dx, dy });
};
$("orb").onpointerup = () => {
  if (dragged) win("moved");
  drag = null;
};
$("orb").onclick = () => (dragged ? (dragged = false) : expand(!open));
$("close").onclick = () => expand(false);
$("typed").onsubmit = (e) => {
  e.preventDefault();
  const text = $("text").value.trim();
  if (text) ($("text").value = ""), handle(text);
};
$("wake").onchange = (e) => setWake(e.target.checked);
window.jarvis.on("expand", (v) => expand(v));
window.jarvis.on("toggle-wake", () => setWake(!wakeOn));
window.jarvis.on("ptt", () => {
  stopSpeaking();
  armed = Date.now();
  expand(true);
  say("Listening…");
  ensureMic();
});

// Setup: Groq key and voice, in the same storage keys voice.js reads.
async function setup() {
  const { groqKey: key, voiceName } = await chrome.storage.local.get(["groqKey", "voiceName"]);
  $("key").value = key ?? "";
  const system = (await getVoices()).filter((v) => v.lang?.startsWith("en"));
  $("voice").replaceChildren(
    new Option("Automatic", ""),
    ...AI_VOICES.map((v) => new Option(`AI: ${v}`, `groq:${v}`)),
    ...system.map((v) => new Option(`Windows: ${v.voiceName}`, v.voiceName)),
  );
  $("voice").value = voiceName ?? "";
}
$("setup").onsubmit = async (e) => {
  e.preventDefault();
  const key = $("key").value.trim();
  await chrome.storage.local.set({ groqKey: key || undefined, voiceName: $("voice").value || undefined }); // undefined removes it: an empty key once looked "set"
  if (!$("voice").value) await chrome.storage.local.remove("voiceName");
  say("Saved.");
  ensureMic();
};

// A proactive word when the battery runs low, once per discharge.
navigator.getBattery?.().then((b) => {
  let warned = false;
  b.onlevelchange = b.onchargingchange = () => {
    if (b.charging) warned = false;
    else if (b.level <= 0.15 && !warned) (warned = true), reply(`Battery at ${Math.round(b.level * 100)} percent. Might I suggest the charger?`);
  };
});

render();
setup();
setWake((await chrome.storage.local.get({ wake: true })).wake);
greet().then(async () => {
  if (await groqKey()) return;
  expand(true);
  $("setup").closest("details").open = true;
  $("key").focus();
  say("I can't hear you yet: paste your Groq API key in Setup below and press Save.");
});
