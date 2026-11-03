import { getVoices, bestVoice, speak } from "./voice.js";

const $ = (id) => document.getElementById(id);

(async () => {
  const voices = (await getVoices()).filter((v) => !v.lang || v.lang.startsWith("en"));
  const { voiceName } = await chrome.storage.local.get("voiceName");
  $("voice").replaceChildren(...voices.map((v) => new Option(v.voiceName, v.voiceName)));
  $("voice").value = voiceName || bestVoice(voices);
})();
$("voice").onchange = () => chrome.storage.local.set({ voiceName: $("voice").value });
$("voice-test").onclick = () => speak("Your reminder to revise chemistry is due in ten minutes.");

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
