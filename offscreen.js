const API = "https://api.groq.com/openai/v1/audio/speech";
let turn = 0; // a newer reply cuts off the one still playing
let playing;
let cut; // ends the wait on the piece now playing: a paused <audio> never fires "ended"

function stop() {
  turn++;
  playing?.pause();
  cut?.();
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg.target !== "offscreen") return;
  if (msg.stop) return stop(), send({});
  play(msg).then(() => send({}), (e) => send({ error: e.message }));
  return true; // answer asynchronously
});

const fetchAudio = (input, voice, key) =>
  fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "canopylabs/orpheus-v1-english", input, voice, response_format: "wav" }),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`Groq voice ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const a = new Audio(URL.createObjectURL(await r.blob()));
    a.playbackRate = 1.1; // a touch quicker, like natural speech; pitch is preserved
    return a;
  });

// replyId names the reply to the page that asked, which is told when it ends ("speech-end").
async function play({ chunks, voice, key, id: replyId }) {
  stop(); // a newer reply cuts off the one still playing
  const id = turn;
  const ended = () => chrome.runtime.sendMessage({ target: "speech-end", id: replyId }).catch(() => {});
  const audios = chunks.map((c) => fetchAudio(c, voice, key)); // fetch all pieces at once, play in order
  const first = await audios[0]; // a failure here makes the caller fall back to Chrome's voice
  if (id !== turn) return ended(); // cut off while fetching
  playing = first;
  await playing.play();
  (async () => {
    try {
      for (const p of audios) {
        const a = await p;
        if (id !== turn) return;
        playing = a;
        if (a.paused) await a.play();
        await new Promise((r) => ((a.onended = r), (cut = r)));
      }
    } finally {
      ended();
    }
  })().catch(() => {}); // a later piece failing just ends the reply early
}
