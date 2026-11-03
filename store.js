// All data is one list in chrome.storage.local; timed reminders/events get an alarm with the item's id.
export async function getItems() {
  return (await chrome.storage.local.get({ items: [] })).items;
}

async function setItems(items) {
  await chrome.storage.local.set({ items });
}

export async function addItem(item) {
  const items = await getItems();
  const saved = { id: crypto.randomUUID(), done: false, ...item };
  await setItems([...items, saved]);
  if (saved.when && saved.type !== "task") await chrome.alarms.create(saved.id, { when: saved.when });
  return saved;
}

export async function removeItem(id) {
  await setItems((await getItems()).filter((i) => i.id !== id));
  await chrome.alarms.clear(id);
}

export async function toggleDone(id) {
  await setItems((await getItems()).map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
}
