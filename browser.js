import { scrollPage } from "./page.js";

// Pages Chrome won't let an extension script, plus Jarvis's own pages.
export function canControl(url, extOrigin) {
  if (!url || url.startsWith(extOrigin)) return false;
  if (!/^(?:https?|file):/.test(url)) return false;
  return !/^https:\/\/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(url);
}

export function pickTab(tabs, words) {
  const want = words.toLowerCase().split(/\s+/).filter(Boolean);
  return tabs.find((t) => want.every((w) => (t.title ?? "").toLowerCase().includes(w))) ?? null;
}

// The page the user is looking at: the active tab of the last focused normal window.
export async function targetTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: "normal" });
  return tab ?? null;
}

async function activate(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return `Switched to ${tab.title}.`;
}

// Runs a {type: "browser"} command from parse.js and returns what to say.
export async function runBrowser(cmd) {
  const tab = await targetTab();
  if (!tab) return "I can't find a tab to control.";
  const mine = (t) => t.url?.startsWith(location.origin);
  // Closing, reloading or muting the listening tab would silence Jarvis.
  if (mine(tab) && ["close", "reload", "mute", "back", "forward"].includes(cmd.action)) return "That's my listening tab. Switch to the page first.";
  switch (cmd.action) {
    case "closeMatch": {
      const hit = pickTab((await chrome.tabs.query({})).filter((t) => !mine(t)), cmd.title);
      if (!hit) return `No tab matches ${cmd.title}.`;
      await chrome.tabs.remove(hit.id);
      return `Closed ${hit.title}.`;
    }
    case "close":
      await chrome.tabs.remove(tab.id);
      return "Closed.";
    case "next":
    case "prev": {
      const tabs = await chrome.tabs.query({ windowId: tab.windowId });
      const i = tabs.findIndex((t) => t.id === tab.id);
      return activate(tabs[(i + (cmd.action === "next" ? 1 : tabs.length - 1)) % tabs.length]);
    }
    case "switch": {
      const hit = pickTab(await chrome.tabs.query({}), cmd.title);
      return hit ? activate(hit) : `No tab matches ${cmd.title}.`;
    }
    case "reopen":
      try {
        await chrome.sessions.restore();
        return "Reopened.";
      } catch {
        return "Nothing to reopen.";
      }
    case "back":
    case "forward":
      try {
        await (cmd.action === "back" ? chrome.tabs.goBack(tab.id) : chrome.tabs.goForward(tab.id));
        return cmd.action === "back" ? "Going back." : "Going forward.";
      } catch {
        return `There's no page to go ${cmd.action} to.`;
      }
    case "reload":
      await chrome.tabs.reload(tab.id);
      return "Reloading.";
    case "mute":
    case "unmute":
      await chrome.tabs.update(tab.id, { muted: cmd.action === "mute" });
      return cmd.action === "mute" ? "Muted." : "Unmuted.";
    default: // scrollDown, scrollUp, top, bottom
      if (!canControl(tab.url, location.origin)) return "I can't control this page.";
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrollPage, args: [cmd.action] });
      return { scrollDown: "Scrolled down.", scrollUp: "Scrolled up.", top: "At the top.", bottom: "At the bottom." }[cmd.action];
  }
}
