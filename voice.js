export const ADDRESS = "O Captain, my Captain";
// Groq's Orpheus voices sound human; Chrome's own voices are the offline fallback.
export const AI_VOICES = ["daniel", "troy", "austin", "diana", "hannah", "autumn"];

// Most human-sounding first: neural "Natural" voices, then Google's network voices, then any English voice.
const PREFERRED = [/natural/i, /^Google UK English Male$/, /^Google US English$/, /^Google UK English Female$/, /./];

export const getVoices = () => new Promise((r) => chrome.tts.getVoices(r));

export function bestVoice(voices) {
  const en = voices.filter((v) => v.lang?.startsWith("en"));
  return PREFERRED.map((re) => en.find((v) => re.test(v.voiceName))).find(Boolean)?.voiceName;
}

// Orpheus takes at most 200 characters per request: pack whole sentences into pieces that fit.
export function chunks(text, max = 200) {
  const out = [];
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [];
  for (const s of sentences.flatMap((s) => (s.length > max ? s.match(new RegExp(`.{1,${max}}(?:\\s|$)`, "g")) : [s]))) {
    const t = s.trim();
    if (!t) continue;
    if (out.length && out.at(-1).length + 1 + t.length <= max) out[out.length - 1] += ` ${t}`;
    else out.push(t);
  }
  return out;
}

// Resolves once speech has started; returns { error } when the AI voice failed and Chrome's voice was used instead.
export async function speak(text) {
  const line = `${ADDRESS}. ${text}`;
  const { voiceName, groqKey } = await chrome.storage.local.get(["voiceName", "groqKey"]);
  const ai = voiceName?.startsWith("groq:") ? voiceName.slice(5) : !voiceName && groqKey ? AI_VOICES[0] : null;
  let error;
  if (ai && groqKey) {
    const res = await playAi(line, ai, groqKey).catch((e) => ({ error: e.message }));
    if (!res?.error) return {};
    error = res.error;
  }
  const local = ai ? undefined : voiceName;
  chrome.tts.speak(line, { voiceName: local || bestVoice(await getVoices()), rate: 1.15 });
  return { error };
}

// The popup closes when a tab opens and the background worker has no <audio>, so an offscreen page plays the sound.
async function playAi(text, voice, key) {
  try {
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["AUDIO_PLAYBACK"], justification: "Play Jarvis's spoken replies" });
  } catch {} // already open; any real failure surfaces as sendMessage rejecting below
  return chrome.runtime.sendMessage({ target: "offscreen", chunks: chunks(text), voice, key });
}
