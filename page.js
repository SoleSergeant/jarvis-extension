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
