export const ADDRESS = "O Captain, my Captain";

// chrome.tts works from the popup and the background worker, and keeps talking after the popup closes.
export const speak = (text) => chrome.tts.speak(`${ADDRESS}. ${text}`);
