import * as chrono from "./vendor/chrono.js";

// Each command: a leading phrase, the type it creates, and whether it needs a time.
const COMMANDS = [
  { re: /^(?:remind me(?: to| about)?|reminder(?: to)?)\s+/, type: "reminder", needsTime: true },
  { re: /^(?:add (?:an? )?event|new event|event|schedule)\s+/, type: "event", needsTime: true },
  { re: /^(?:add (?:a )?task|new task|task|add)\s+/, type: "task", needsTime: false },
];

const SEARCH = /^(?:search(?: the web)?(?: for)?|look up|google)\s+/;
const QUESTION = /^(?:who|what|when|where|which|why|how)(?:'s|\s)/;

// Returns {type, title, when (ms or null)} or null when no rule fits (caller may fall back to Groq).
// For "search", title is the query.
export function parse(text, now = new Date()) {
  const clean = text.trim().toLowerCase().replace(/^(?:hey |ok )?jarvis[,.]?\s*/, "").replace(/[.!?]+$/, "");
  if (SEARCH.test(clean)) return { type: "search", title: clean.replace(SEARCH, ""), when: null };
  if (QUESTION.test(clean)) return { type: "search", title: clean, when: null };
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
