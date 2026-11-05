import { getItems } from "./store.js";
import { speak } from "./voice.js";

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const item = (await getItems()).find((i) => i.id === alarm.name);
  if (!item || item.done) return;
  chrome.notifications.create(item.id, {
    type: "basic",
    iconUrl: "icon.png",
    title: item.type === "event" ? "Event now" : "Reminder",
    message: item.title,
    priority: 2,
    requireInteraction: true,
  });
  speak(`${item.type === "event" ? "Event now" : "Reminder"}: ${item.title}`);
});

const LISTEN_URL = chrome.runtime.getURL("popup.html?wake");
async function openListenTab() {
  const [tab] = await chrome.tabs.query({ url: LISTEN_URL });
  if (!tab) return chrome.tabs.create({ url: LISTEN_URL, pinned: true, active: false });
  // A pinned tab Chrome restored may not have loaded yet, and only a loaded page can listen.
  if (tab.discarded || tab.status === "unloaded") await chrome.tabs.reload(tab.id);
}
chrome.runtime.onStartup.addListener(openListenTab);
chrome.runtime.onInstalled.addListener(openListenTab);
chrome.windows.onCreated.addListener(openListenTab); // onStartup is skipped if Chrome kept running with no windows
