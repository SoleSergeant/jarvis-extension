import { getItems } from "./store.js";

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
});
