// What Jarvis says for "what's on today": today's events and reminders in time order, tasks due today,
// overdue tasks, and how many open tasks have no date. items are the store's {type, title, when, done}.
export function briefing(items, now = new Date()) {
  const start = new Date(now).setHours(0, 0, 0, 0);
  const end = start + 24 * 60 * 60 * 1000;
  const open = items.filter((i) => !i.done);
  const today = open.filter((i) => i.when >= start && i.when < end).sort((a, b) => a.when - b.when);
  const timed = today.filter((i) => i.type !== "task");
  const due = today.filter((i) => i.type === "task");
  const overdue = open.filter((i) => i.type === "task" && i.when && i.when < start);
  const undated = open.filter((i) => i.type === "task" && !i.when).length;

  const parts = [];
  if (timed.length) parts.push(`Today: ${list(timed.map((i) => `${i.type === "reminder" ? "a reminder to " : ""}${i.title} at ${clock(i.when)}`))}.`);
  if (due.length) parts.push(`Due today: ${list(due.map((i) => i.title))}.`);
  if (overdue.length) parts.push(`Overdue: ${list(overdue.map((i) => i.title))}.`);
  if (!parts.length) parts.push("Nothing on today.");
  if (undated) parts.push(`You${parts[0] === "Nothing on today." ? "" : " also"} have ${undated} open task${undated === 1 ? "" : "s"} with no date.`);
  return parts.join(" ");
}

const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`);
// "10:30 AM", "5 PM": written out by hand so speech sounds the same in every locale.
function clock(ms) {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  return `${h}${m ? `:${String(m).padStart(2, "0")}` : ""} ${d.getHours() < 12 ? "AM" : "PM"}`;
}
