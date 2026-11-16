// snapshot, act and scrollPage are injected into web pages with chrome.scripting.executeScript,
// which sends only a function's source: they must not use anything outside their own bodies.

export function snapshot() {
  const SENSITIVE = /card number|cvv|cvc|password/i;
  const label = (el) =>
    (el.getAttribute("aria-label") || el.labels?.[0]?.innerText || el.placeholder || el.innerText || el.value || el.title || el.querySelector?.("img[alt]")?.alt || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  for (const old of document.querySelectorAll("[data-jarvis-id]")) old.removeAttribute("data-jarvis-id");
  const all = [
    ...document.querySelectorAll(
      'a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=tab], [role=menuitem], [contenteditable=""], [contenteditable=true]',
    ),
  ].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true });
  });
  // What is on screen first: on long pages like YouTube that is what the user is talking about.
  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  };
  const picked = [...all.filter(onScreen), ...all.filter((el) => !onScreen(el))].slice(0, 150);
  const elements = picked.map((el, i) => {
    el.setAttribute("data-jarvis-id", String(i + 1));
    const text = label(el);
    return {
      id: i + 1,
      role: el.getAttribute("role") || (el.tagName === "INPUT" ? `input ${el.type}` : el.tagName === "A" ? "link" : el.tagName.toLowerCase()),
      text,
      sensitive: el.type === "password" || (el.getAttribute("autocomplete") ?? "").startsWith("cc-") || SENSITIVE.test(text),
    };
  });
  return { title: document.title, url: location.href, text: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 6000), elements };
}

// label is the element's text at snapshot time: pages that reuse nodes (feeds, inboxes) may now show something else there.
export function act(id, action, text, submit, label) {
  const el = document.querySelector(`[data-jarvis-id="${Number(id)}"]`);
  const now = (el?.getAttribute("aria-label") || el?.labels?.[0]?.innerText || el?.placeholder || el?.innerText || el?.value || el?.title || el?.querySelector?.("img[alt]")?.alt || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!el || (action === "click" && now !== label)) return "gone";
  // Checked again here: the page may have changed since the snapshot.
  const name = el.getAttribute("aria-label") || el.labels?.[0]?.innerText || el.placeholder || "";
  if (el.type === "password" || (el.getAttribute("autocomplete") ?? "").startsWith("cc-") || /card number|cvv|cvc|password/i.test(name)) return "sensitive";
  el.scrollIntoView({ block: "center" });
  if (action === "click") {
    el.click();
    return "ok";
  }
  if (!el.isContentEditable && !el.matches("input, textarea, select")) return "not-field";
  el.focus();
  if (el.isContentEditable) el.textContent = text;
  else {
    // The native setter, so React-style pages notice the change.
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  if (submit) {
    if (el.form) el.form.requestSubmit();
    else el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
  }
  return "ok";
}

// Controls the page's main video or audio and returns what to say. Self-contained, like snapshot and act.
export function media(action, n) {
  if (action === "skipAd") {
    const skip = document.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern");
    return skip ? (skip.click(), "Skipped the ad.") : "There's no ad to skip right now.";
  }
  if (action === "next") {
    const next = document.querySelector(".ytp-next-button");
    return next ? (next.click(), "Next one.") : "I can't find a next button on this page.";
  }
  // The one that's playing, else the biggest visible video, else any audio.
  const size = (m) => m.getBoundingClientRect().width * m.getBoundingClientRect().height;
  const all = [...document.querySelectorAll("video, audio")];
  const m = all.find((x) => !x.paused) ?? all.filter((x) => x.tagName === "VIDEO").sort((a, b) => size(b) - size(a))[0] ?? all[0];
  if (!m) return "There's no video or music on this page.";
  const speed = (r) => `${Math.round(r * 100) / 100}x speed.`;
  switch (action) {
    case "pause":
      m.pause();
      return "Paused.";
    case "play":
      m.play().catch(() => {}); // the page may refuse without a real click; nothing more to do
      return "Playing.";
    case "restart":
      m.currentTime = 0;
      m.play().catch(() => {});
      return "From the top.";
    case "seek":
      m.currentTime = Math.max(0, Math.min(m.duration || Infinity, m.currentTime + n));
      return n > 0 ? `Skipped ${Math.abs(n)} seconds.` : `Back ${Math.abs(n)} seconds.`;
    case "volume":
      m.muted = false;
      m.volume = Math.max(0, Math.min(1, Math.round((m.volume + 0.2 * n) * 10) / 10));
      return `Volume ${Math.round(m.volume * 100)} percent.`;
    case "speed":
      m.playbackRate = n === 0 ? 1 : Math.max(0.25, Math.min(3, m.playbackRate + 0.25 * n));
      return n === 0 ? "Normal speed." : speed(m.playbackRate);
  }
  return "I can't do that with this video.";
}

export function scrollPage(how) {
  if (how === "top") scrollTo({ top: 0, behavior: "smooth" });
  else if (how === "bottom") scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  else scrollBy({ top: (how === "scrollUp" ? -0.8 : 0.8) * innerHeight, behavior: "smooth" });
}

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
export const countMatches = (elements, words) => elements.filter((e) => norm(e.text) === norm(words)).length;
// The one element whose text is exactly the spoken words, or null if none or several.
export function matchText(elements, words) {
  const hits = elements.filter((e) => norm(e.text) === norm(words));
  return hits.length === 1 ? hits[0] : null;
}

export const isRisky = (text) =>
  /\b(?:buy|pay|purchase|order|checkout|send|delete|remove|submit|post|publish|confirm|transfer|unsubscribe|sign out|log out)\b/i.test(text);
// The whole reply must be a yes: "go ahead and cancel" or "do it later" must not click.
export const isYes = (text) =>
  /^(?:yes|yeah|yep|sure|do it|go ahead)(?: please)?$/.test(text.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim());
export const isSearchField = (el) => /^(?:input|textarea)/.test(el.role) && /search/i.test(`${el.role} ${el.text}`);
