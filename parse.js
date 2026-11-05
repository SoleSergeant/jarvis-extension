import * as chrono from "./vendor/chrono.js";

// Each command: a leading phrase, the type it creates, and whether it needs a time.
const COMMANDS = [
  { re: /^(?:remind me(?: to| about)?|reminder(?: to)?)\s+/, type: "reminder", needsTime: true },
  { re: /^(?:add (?:an? )?event|new event|event|schedule)\s+/, type: "event", needsTime: true },
  { re: /^(?:add (?:a )?task|new task|task|add)\s+/, type: "task", needsTime: false },
];

const SEARCH = /^(?:search(?: the web)?(?: for)?|look up|google)\s+/;
const SEARCH_ON = /^(?:play|search(?: for)?|look up|find)\s+(.+?)\s+on\s+(youtube|spotify|google)$/;
const PLAY = /^play\s+(.+)$/; // plain "play X" goes to YouTube
const OPEN = /^(?:open|go to|launch)\s+(?:up\s+)?(?:the\s+)?(.+)$/;
// shortcut: Spotify/YouTube open search results, not auto-play; that needs their APIs and a login.
const SEARCH_URL = {
  youtube: "https://www.youtube.com/results?search_query=",
  spotify: "https://open.spotify.com/search/",
  google: "https://www.google.com/search?q=",
};
const SITES = {
  youtube: "https://www.youtube.com",
  spotify: "https://open.spotify.com",
  gmail: "https://mail.google.com",
  google: "https://www.google.com",
  calendar: "https://calendar.google.com",
  github: "https://github.com",
  chatgpt: "https://chatgpt.com",
  telegram: "https://web.telegram.org",
  instagram: "https://www.instagram.com",
};
function siteUrl(name) {
  const key = name.replace(/\s+/g, ""); // speech often splits "you tube"
  if (SITES[key]) return SITES[key];
  if (/^[\w-]+(\.[\w-]+)+$/.test(key)) return `https://${key}`; // "open ozodjonov.com"
  return SEARCH_URL.google + encodeURIComponent(name);
}
const QUESTION = /^(?:who|what|when|where|which|why|how)(?:'s|\s)/;
const SMALL_TALK = /^(?:tell me|give me|i'm|i am|i feel|hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening|night))\b/;

// For the listening tab: what was said after "Jarvis" ("" if nothing yet), or null if the name wasn't said.
export const afterWake = (text) => text.match(/\bjarvis\b[,.!?]*\s*(.*)$/i)?.[1].trim() ?? null;

// Returns {type, title, when (ms or null)} or null when no rule fits (caller may fall back to Groq).
// For "search", title is the query; for "talk", it's what to say to Groq's chat.
export function parse(text, now = new Date()) {
  const clean = text.trim().toLowerCase().replace(/^(?:hey |ok )?jarvis[,.]?\s*/, "").replace(/[.!?]+$/, "");
  const play = clean.match(PLAY);
  const site = clean.match(SEARCH_ON) ?? (play && [play[0], play[1], "youtube"]);
  if (site) return { type: "open", title: `${site[1]} on ${site[2]}`, when: null, url: SEARCH_URL[site[2]] + encodeURIComponent(site[1]) };
  const name = clean.match(OPEN)?.[1];
  if (name) return { type: "open", title: name, when: null, url: siteUrl(name) };
  if (SEARCH.test(clean)) return { type: "search", title: clean.replace(SEARCH, ""), when: null };
  if (QUESTION.test(clean) || SMALL_TALK.test(clean)) return { type: "talk", title: clean, when: null };
  const cmd = COMMANDS.find((c) => c.re.test(clean));
  if (!cmd) return null;

  let rest = clean.replace(cmd.re, "").replace(/\s+to my (?:tasks|list|calendar)\b/, "");
  const hit = chrono.parse(rest, now, { forwardDate: true })[0];
  if (!hit && cmd.needsTime) return null;

  let when = null;
  if (hit) {
    const d = hit.start.date();
    if (!hit.start.isCertain("hour")) d.setHours(9, 0, 0, 0); // a date with no time means 09:00, not chrono's noon
    when = d.getTime();
    rest = (rest.slice(0, hit.index) + rest.slice(hit.index + hit.text.length))
      .replace(/\s+(?:at|on|in|by|for)\s*$/, "")
      .replace(/^\s*(?:at|on|in|by|for|to)\s+/, ""); // "remind me tomorrow to X" leaves a leading "to"
  }
  const title = rest.replace(/\s+/g, " ").trim();
  return title ? { type: cmd.type, title, when } : null;
}
