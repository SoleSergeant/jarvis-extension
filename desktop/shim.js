// Just enough of the chrome.* API for the extension's store.js, voice.js and offscreen.js to run here unchanged.
// A classic script, so it is in place before any module loads.
(() => {
  const area = (backing, prefix) => ({
    async get(keys) {
      const all = {};
      for (let i = 0; i < backing.length; i++) {
        const k = backing.key(i);
        if (k.startsWith(prefix)) all[k.slice(prefix.length)] = JSON.parse(backing.getItem(k));
      }
      if (keys == null) return all;
      const defaults = typeof keys === "string" ? { [keys]: undefined } : Array.isArray(keys) ? Object.fromEntries(keys.map((k) => [k, undefined])) : keys;
      const out = {};
      for (const [k, d] of Object.entries(defaults)) {
        const v = k in all ? all[k] : d;
        if (v !== undefined) out[k] = v;
      }
      return out;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) v === undefined ? backing.removeItem(prefix + k) : backing.setItem(prefix + k, JSON.stringify(v));
    },
    async remove(keys) {
      for (const k of [].concat(keys)) backing.removeItem(prefix + k);
    },
  });

  const listeners = (list = []) => ({ list, addListener: (fn) => list.push(fn) });

  // Alarms: plain timers. setTimeout tops out at about 24.8 days, so long waits are chained.
  const timers = new Map();
  const onAlarm = listeners();
  const MAX = 2 ** 31 - 1;
  function arm(name, when) {
    const left = when - Date.now();
    timers.set(name, setTimeout(() => (left > MAX ? arm(name, when) : (timers.delete(name), onAlarm.list.forEach((fn) => fn({ name, scheduledTime: when })))), Math.max(0, Math.min(left, MAX))));
  }

  // In-page message bus: offscreen.js plays audio and voice.js hears "speech-end", both in this one page.
  const onMessage = listeners();
  const sendMessage = (msg) =>
    new Promise((resolve) => {
      let done = false;
      const reply = (r) => !done && ((done = true), resolve(r));
      const waits = onMessage.list.map((fn) => fn(msg, {}, reply) === true).some(Boolean);
      if (!waits) queueMicrotask(() => reply(undefined));
    });

  // chrome.tts on the system voices.
  const voices = () =>
    new Promise((resolve) => {
      const now = speechSynthesis.getVoices();
      if (now.length) return resolve(now);
      const t = setTimeout(() => resolve(speechSynthesis.getVoices()), 1500); // voiceschanged may never fire
      speechSynthesis.addEventListener("voiceschanged", () => (clearTimeout(t), resolve(speechSynthesis.getVoices())), { once: true });
    });
  const tts = {
    getVoices: (cb) => voices().then((vs) => cb(vs.map((v) => ({ voiceName: v.name, lang: v.lang })))),
    async speak(text, { voiceName, rate = 1, onEvent } = {}) {
      tts.stop();
      const vs = await voices();
      const voice = vs.find((v) => v.name === voiceName) ?? vs.find((v) => v.lang?.startsWith("en"));
      // No English voice in Chromium's list: main.js speaks it with an English Windows voice instead.
      if (!voice) return window.jarvis.win({ action: "say", arg: text }).catch(() => {}).finally(() => onEvent?.({ type: "end" }));
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = rate;
      u.onend = () => onEvent?.({ type: "end" });
      u.onerror = (e) => onEvent?.({ type: e.error === "interrupted" || e.error === "canceled" ? "interrupted" : "error" });
      speechSynthesis.speak(u);
    },
    stop: () => (speechSynthesis.cancel(), window.jarvis.win({ action: "hush" }).catch(() => {})),
  };

  window.chrome = {
    storage: { local: area(localStorage, "jarvis:"), session: area(sessionStorage, "jarvis:") },
    alarms: {
      create: async (name, { when }) => (clearTimeout(timers.get(name)), arm(name, when)),
      clear: async (name) => (clearTimeout(timers.get(name)), timers.delete(name)),
      onAlarm,
    },
    runtime: { onMessage, sendMessage },
    offscreen: { createDocument: async () => {} },
    tts,
  };
})();
