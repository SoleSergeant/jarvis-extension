// Windows commands for the desktop app. Pure, so main.js, the window and the tests can all use it.

const PC = String.raw`(?:the |my )?(?:computer|pc|laptop|system)`;
const RULES = [
  [/^(?:mute|unmute)(?: the)?(?: volume| sound| audio| computer| pc)?$/, "mute"],
  [new RegExp(`^lock(?: ${PC}| (?:the |my )?screen)?$`), "lock"],
  [/^(?:show (?:the |my )?desktop|minimi[sz]e (?:all|everything)(?: windows)?)$/, "desktop"],
  [/^(?:previous|last) (?:song|track)$/, "prev"],
  [new RegExp(`^(?:shut ?down|turn off|power off)(?: ${PC})?$`), "shutdown"],
  [new RegExp(`^(?:restart|reboot) ${PC}$`), "restart"], // plain "restart" is the video's restart
  [new RegExp(`^(?:go to sleep|sleep|put ${PC} to sleep)$`), "sleep"],
  [/^(?:what time is it|what's the time|the time|time|tell me the time)(?: now)?$/, "time"],
  [/^(?:what's (?:the )?date|what's today's date|what day is (?:it|today)|what's today)(?: today)?$/, "date"],
  [new RegExp(`^(?:status(?: report)?|system status|diagnostics|run (?:a )?diagnostics|how's ${PC}(?: doing)?|battery(?: level| status)?|how much battery(?: is)?(?: left)?)$`), "status"],
  [/^(?:weather|(?:what's|how's) the weather(?: like)?(?: today| outside| now)?|is it (?:cold|hot|raining)(?: outside| today)?|will it rain(?: today)?)$/, "weather"],
  [/^(?:good (?:morning|afternoon|evening)|i'm (?:home|back)|wake up|daddy's home)(?: jarvis)?$/, "hello"],
];
const VOLUME = /^(?:set (?:the )?volume(?: to)?|volume(?: to)?) (\d{1,3})(?: ?%| percent)?$/;
const FOLDER = /^open (?:my |the )?(downloads|documents|desktop|pictures|music|videos)(?: folder)?$/;

// These ask "Shall I…?" first and need a yes.
export const CONFIRM = { shutdown: "shut down the computer", restart: "restart the computer", sleep: "put the computer to sleep" };

const clean = (text) => text.trim().toLowerCase().replace(/^(?:hey |ok )?jarvis[,.]?\s*/, "").replace(/[.!?]+$/, "");

// {action, arg?} for a Windows command, or null to let parse.js have it.
export function winCommand(text) {
  const t = clean(text);
  const hit = RULES.find(([re]) => re.test(t));
  if (hit) return { action: hit[1] };
  let m;
  if ((m = t.match(VOLUME))) return { action: "volume", arg: Math.min(100, Number(m[1])) };
  if ((m = t.match(FOLDER))) return { action: "folder", arg: m[1] };
  return null;
}

const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SAME = { files: "file explorer", explorer: "file explorer", "vs code": "visual studio code", vscode: "visual studio code", cmd: "command prompt" };

// The best match for a spoken name: exact name, then name starting with it, then all its words; shortest name wins ties.
// fields(item) lists the names an item can be called by.
export function pick(list, spoken, fields) {
  let want = norm(spoken);
  want = SAME[want] ?? want;
  if (!want) return null;
  const squash = (s) => s.replace(/ /g, ""); // speech splits "you tube"
  const score = (item) =>
    Math.max(
      0,
      ...fields(item).map(norm).filter(Boolean).map((n) => {
        if (n === want || squash(n) === squash(want)) return 3;
        if (n.startsWith(`${want} `)) return 2;
        const words = n.split(" ");
        return want.split(" ").every((w) => words.includes(w)) ? 1 : 0;
      }),
    );
  let top = null;
  let best = 0;
  for (const item of list) {
    if (/uninstall/i.test(fields(item).join(" "))) continue;
    const s = score(item);
    if (s > best || (s && s === best && fields(item)[0].length < fields(top)[0].length)) (top = item), (best = s);
  }
  return top;
}

// "Good evening", by the hour.
export const partOfDay = (d) => (d.getHours() < 5 ? "Good evening" : d.getHours() < 12 ? "Good morning" : d.getHours() < 18 ? "Good afternoon" : "Good evening");

// "It's 8:05 PM on Saturday, November 15." Written out by hand so speech sounds the same in every locale.
export function timeLine(d) {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  const clock = `${h}${m ? `:${String(m).padStart(2, "0")}` : ""} ${d.getHours() < 12 ? "AM" : "PM"}`;
  return `It's ${clock} on ${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`;
}

// s = {cpu: 0..1, memUsed, memTotal (bytes), uptime (s), battery?: {level 0..1, charging}}
export function statusLine(s) {
  const pct = (x) => `${Math.round(x * 100)} percent`;
  const hours = Math.floor(s.uptime / 3600);
  const parts = [`CPU at ${pct(s.cpu)}, memory at ${pct(s.memUsed / s.memTotal)} of ${Math.round(s.memTotal / 2 ** 30)} gigabytes.`];
  if (s.battery) parts.push(`Battery ${pct(s.battery.level)}, ${s.battery.charging ? "charging" : "on battery power"}.`);
  parts.push(hours ? `Up for ${hours} hour${hours === 1 ? "" : "s"}.` : "Freshly booted.");
  if (s.cpu > 0.85 || s.memUsed / s.memTotal > 0.9) parts.push("Running rather hot, I'm afraid.");
  else parts.push("All systems nominal.");
  return parts.join(" ");
}

// WMO weather codes from open-meteo, in words.
const SKY = [[0, "clear skies"], [2, "a few clouds"], [3, "overcast"], [48, "fog"], [57, "drizzle"], [67, "rain"], [77, "snow"], [82, "rain showers"], [86, "snow showers"], [99, "thunderstorms"]];
export function weatherLine(w, city) {
  const c = w.current;
  const sky = SKY.find(([max]) => c.weather_code <= max)?.[1] ?? "odd weather";
  const hi = Math.round(w.daily.temperature_2m_max[0]);
  const lo = Math.round(w.daily.temperature_2m_min[0]);
  const where = city ? ` in ${city}` : "";
  const coat = hi < 8 ? " A coat would be wise." : c.weather_code >= 51 ? " An umbrella might be in order." : "";
  return `It's ${Math.round(c.temperature_2m)} degrees${where} with ${sky}. Today ranges from ${lo} to ${hi}.${coat}`;
}

const ACKS = ["Done.", "As you wish.", "Right away.", "Consider it done.", "Very good."];
export const ack = () => ACKS[Math.floor(Math.random() * ACKS.length)];
