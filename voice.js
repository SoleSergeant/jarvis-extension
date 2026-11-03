export const ADDRESS = "O Captain, my Captain";

// Most human-sounding first: neural "Natural" voices, then Google's network voices, then any English voice.
const PREFERRED = [/natural/i, /^Google UK English Male$/, /^Google US English$/, /^Google UK English Female$/, /./];

export const getVoices = () => new Promise((r) => chrome.tts.getVoices(r));

export function bestVoice(voices) {
  const en = voices.filter((v) => v.lang?.startsWith("en"));
  return PREFERRED.map((re) => en.find((v) => re.test(v.voiceName))).find(Boolean)?.voiceName;
}

// chrome.tts works from the popup and the background worker, and keeps talking after the popup closes.
export async function speak(text) {
  const { voiceName } = await chrome.storage.local.get("voiceName");
  chrome.tts.speak(`${ADDRESS}. ${text}`, { voiceName: voiceName || bestVoice(await getVoices()), rate: 0.95 });
}
