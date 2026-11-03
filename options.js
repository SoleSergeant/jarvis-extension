import { getVoices, bestVoice, speak, AI_VOICES } from "./voice.js";

const $ = (id) => document.getElementById(id);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

(async () => {
  const voices = (await getVoices()).filter((v) => !v.lang || v.lang.startsWith("en"));
  const { voiceName, groqKey } = await chrome.storage.local.get(["voiceName", "groqKey"]);
  $("voice").replaceChildren(
    ...AI_VOICES.map((v) => new Option(`${cap(v)} (AI voice)`, `groq:${v}`)),
    ...voices.map((v) => new Option(`${v.voiceName} (Chrome)`, v.voiceName)),
  );
  $("voice").value = voiceName || (groqKey ? `groq:${AI_VOICES[0]}` : bestVoice(voices));
})();
$("voice").onchange = () => chrome.storage.local.set({ voiceName: $("voice").value });
$("voice-test").onclick = async () => {
  $("voice-status").textContent = "Speaking…";
  const { error } = await speak("Your reminder to revise chemistry is due in ten minutes.");
  $("voice-status").textContent = error ? `AI voice failed, used Chrome's voice: ${error}` : "";
};

$("mic-btn").onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop()); // only needed the permission, not the audio
    $("mic-status").textContent = "Microphone allowed. Press Alt+J and speak.";
  } catch (e) {
    $("mic-status").textContent = `Not allowed: ${e.message}`;
  }
};

chrome.storage.local.get("groqKey").then(({ groqKey }) => groqKey && ($("key-status").textContent = "A key is saved."));
$("key-form").onsubmit = async (e) => {
  e.preventDefault();
  const groqKey = $("key").value.trim();
  if (groqKey) await chrome.storage.local.set({ groqKey });
  else await chrome.storage.local.remove("groqKey");
  $("key").value = "";
  $("key-status").textContent = groqKey ? "Saved." : "Key removed.";
};
