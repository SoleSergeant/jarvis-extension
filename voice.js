export const ADDRESS = "O Captain, my Captain";
const PAUSE_MS = 10 * 60 * 1000;
// The Captain line opens a conversation after a quiet spell, not every reply.
export const greet = (text, lastSpokeAt, now) => (lastSpokeAt === undefined || now - lastSpokeAt >= PAUSE_MS ? `${ADDRESS}. ${text}` : text);
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

// The offscreen page reports when an AI reply has finished (or was cut off) by its id.
const endWaiters = new Map();
globalThis.chrome?.runtime.onMessage.addListener((msg) => { // no chrome under node --test
  if (msg.target === "speech-end") endWaiters.get(msg.id)?.(), endWaiters.delete(msg.id);
});

// Resolves once speech has started; returns { error } when the AI voice failed and Chrome's voice was used instead.
// onEnd, if given, runs once when the reply has finished playing, was cut off, or failed.
export async function speak(text, onEnd = () => {}) {
  // Session storage: shared by the popup, the listening tab and reminders, and cleared when Chrome closes.
  const { lastSpokeAt } = await chrome.storage.session.get("lastSpokeAt");
  await chrome.storage.session.set({ lastSpokeAt: Date.now() });
  const line = greet(text, lastSpokeAt, Date.now());
  const { voiceName, groqKey } = await chrome.storage.local.get(["voiceName", "groqKey"]);
  const ai = voiceName?.startsWith("groq:") ? voiceName.slice(5) : !voiceName && groqKey ? AI_VOICES[0] : null;
  let error;
  if (ai && groqKey) {
    const id = crypto.randomUUID();
    endWaiters.set(id, onEnd);
    const res = await playAi(line, ai, groqKey, id).catch((e) => ({ error: e.message }));
    if (!res?.error) return {};
    endWaiters.delete(id);
    error = res.error;
  }
  const local = ai ? undefined : voiceName;
  chrome.tts.speak(line, {
    voiceName: local || bestVoice(await getVoices()),
    rate: 1.15,
    onEvent: (e) => ["end", "interrupted", "cancelled", "error"].includes(e.type) && onEnd(),
  });
  return { error };
}

// Cuts off whatever Jarvis is saying, in either voice.
export function stopSpeaking() {
  chrome.tts.stop();
  chrome.runtime.sendMessage({ target: "offscreen", stop: true }).catch(() => {}); // no offscreen page: nothing playing
}

// The popup closes when a tab opens and the background worker has no <audio>, so an offscreen page plays the sound.
async function playAi(text, voice, key, id) {
  try {
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["AUDIO_PLAYBACK"], justification: "Play Jarvis's spoken replies" });
  } catch {} // already open; any real failure surfaces as sendMessage rejecting below
  return chrome.runtime.sendMessage({ target: "offscreen", chunks: chunks(text), voice, key, id });
}
