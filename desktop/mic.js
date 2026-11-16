// Always-on listening without Chrome's speech service (Electron has none): find each spoken phrase
// by loudness, then have Groq Whisper write it down.

const CHUNK = 4096; // ~85 ms at 48 kHz
const RATE = 16000; // what Whisper wants; keeps uploads small

// Cuts a stream of audio chunks into utterances. feed() returns the chunks of a finished utterance, or null.
export class Segmenter {
  constructor({ pre = 6, hang = 10, min = 3, max = 180, floorMin = 0.008 } = {}) {
    Object.assign(this, { pre, hang, min, max, floorMin, floor: floorMin, ring: [], seg: null });
  }
  get speaking() {
    return !!this.seg;
  }
  feed(chunk, rms) {
    const loud = rms > Math.max(this.floorMin, this.floor * 3);
    if (!this.seg) {
      if (!loud) {
        this.floor = this.floor * 0.95 + rms * 0.05; // follows the background noise of the room
        this.ring.push(chunk); // kept so the start of "Jarvis" is not clipped
        if (this.ring.length > this.pre) this.ring.shift();
        return null;
      }
      this.seg = { chunks: [...this.ring, chunk], voiced: 1, quiet: 0 };
      this.ring = [];
      return null;
    }
    const s = this.seg;
    s.chunks.push(chunk);
    if (loud) (s.voiced++, (s.quiet = 0));
    else s.quiet++;
    const full = s.chunks.length >= this.max;
    if (s.quiet < this.hang && !full) return null;
    if (full) this.floor = rms; // steady noise (a fan, music) should not keep opening new phrases
    this.seg = null;
    return s.voiced >= this.min ? s.chunks : null;
  }
}

export function downsample(x, from, to = RATE) {
  const ratio = from / to;
  const out = new Float32Array(Math.floor(x.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(x.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += x[j];
    out[i] = sum / Math.max(1, b - a);
  }
  return out;
}

// 16-bit mono PCM WAV.
export function encodeWav(x, rate = RATE) {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + x.length * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, x.length * 2, true);
  x.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return buf;
}

// Words Jarvis expects, so Whisper spells them right instead of guessing similar-sounding ones.
const PROMPT = "Jarvis, open Spotify. Jarvis, set the volume to 30. Remind me to study at 5 PM. Next tab, close YouTube, pause, skip the ad, what's the weather, what time is it.";

// Whisper marks parts it thinks were noise or a guess; those are where most wrong words come from.
export function keepSure(segments, text) {
  if (!segments?.length) return (text ?? "").trim();
  return segments
    .filter((s) => !(s.no_speech_prob > 0.6 && s.avg_logprob < -0.8) && !(s.avg_logprob < -1.3))
    .map((s) => s.text)
    .join("")
    .trim();
}

export async function transcribe(wav, key) {
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "speech.wav");
  form.append("model", "whisper-large-v3"); // the full model hears noticeably better than turbo, for a little more time
  form.append("language", "en");
  form.append("temperature", "0");
  form.append("prompt", PROMPT);
  form.append("response_format", "verbose_json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq listening ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: keepSure(j.segments, j.text), raw: (j.text ?? "").trim() };
}

// Calls onPhrase(wav) for each phrase heard and onSpeaking(bool) as speech starts and stops.
export async function startMic(onPhrase, onSpeaking) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext();
  const node = ctx.createScriptProcessor(CHUNK, 1, 1);
  const seg = new Segmenter();
  let on = true;
  node.onaudioprocess = (e) => {
    if (!on) return;
    const x = new Float32Array(e.inputBuffer.getChannelData(0));
    let sum = 0;
    for (const s of x) sum += s * s;
    const was = seg.speaking;
    const chunks = seg.feed(x, Math.sqrt(sum / x.length));
    if (seg.speaking !== was) onSpeaking(seg.speaking);
    if (!chunks) return;
    const all = new Float32Array(chunks.length * CHUNK);
    chunks.forEach((c, i) => all.set(c, i * CHUNK));
    onPhrase(encodeWav(downsample(all, ctx.sampleRate)));
  };
  ctx.createMediaStreamSource(stream).connect(node);
  node.connect(ctx.destination); // a ScriptProcessor only runs while connected; it outputs silence
  return { setOn: (v) => (on = v) };
}
