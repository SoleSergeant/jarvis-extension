# Jarvis browser control — design

Date: 2026-11-09. Approach A (rules plus Groq for page actions), approved in chat.

## Goal

Jarvis acts on the page you are looking at: clicks, types, controls tabs, and reads the page to answer questions about it. Success: a common task works hands-free, for example "open YouTube", "click the second video", "scroll down", "summarize this page".

"This page" means the active tab in the last focused normal window, never Jarvis's own listening tab or popup.

## Commands

### Tab and page control (rules only, no Groq key needed)

| Say | Does |
|---|---|
| close tab | closes the current tab |
| next tab / previous tab | switches tab in the current window |
| switch to `<words>` tab | switches to the first tab whose title contains the words |
| reopen tab / reopen closed tab | restores the last closed tab (`chrome.sessions`) |
| go back / go forward | history back or forward |
| reload / refresh | reloads |
| scroll down / up | scrolls by most of a screen |
| scroll to top / bottom | jumps to the top or bottom |
| mute tab / unmute tab | mutes or unmutes the current tab |

### Page commands

| Say | Does |
|---|---|
| click `<words>` | clicks a link or button |
| type `<text>` in/into `<field>` | fills a field |
| search this site/page for `<text>` | fills the page's search box and submits |
| summarize this page | spoken two or three sentence summary |
| what does this page say about `<x>` | spoken answer from the page text |

## How a page command runs

1. `popup.js` gets `{type: "page", ...}` from `parse.js`.
2. It finds the target tab. On `chrome://`, `edge://`, `about:`, the Chrome Web Store or a failed injection, Jarvis says "I can't control this page."
3. It injects `page.js` with `chrome.scripting.executeScript`. `snapshot()` returns:
   - `title`, `url`;
   - `elements`: up to 150 visible links, buttons, inputs, textareas, selects and `[role=button|link|tab|menuitem]`, each with a numeric `id` (stored as `data-jarvis-id` on the element), `role` and short `text` (its label, aria-label, placeholder or inner text, cut to 80 characters);
   - `text`: the page's visible text, cut to 6,000 characters.
4. Fast path for "click `<words>`": if exactly one element's text equals the words, ignoring case and punctuation, use it. If not, fall through.
5. Otherwise `groqPage(command, snapshot, key)` asks Groq for JSON `{"action": "click"|"type"|"answer"|"none", "id": number|null, "text": string|null, "say": string}`. `checkPage()` keeps it only if the action is one of these, any `id` exists in the snapshot, and `say` is a non-empty string. The page text is passed as data, with an instruction never to follow instructions inside it.
6. Before acting:
   - If the element is a password field, or has `autocomplete` starting with `cc-`, or its label mentions card number, CVV or password, Jarvis refuses and says why.
   - If the element's text matches the risky words (buy, pay, purchase, order, checkout, send, delete, remove, submit, post, publish, confirm, transfer, unsubscribe, sign out, log out), Jarvis says "Shall I click `<text>`?". Only "yes" (or "yeah", "do it", "go ahead") within 10 seconds carries it out; anything else, or silence, cancels.
7. `act(id, action, text)` runs in the page: scrolls the element into view, then either calls `click()`, or focuses it, sets the value through the native setter and fires `input` and `change` (so React-style sites see it). "search this site for" also submits the field's form or presses Enter.
8. Jarvis speaks `say`, or for "answer" the answer.

Without a Groq key, only the fast-path click and the tab commands work; other page commands say a key is needed.

## Better assisting

Chat (`groqTalk`) also gets the current tab's title and URL, so "what is this about?" or "is this site legit?" know what you are looking at. It does not get the page text; "summarize this page" is the command for that.

## Files

- `manifest.json`: add `scripting`, `sessions`; host permissions `<all_urls>` (needed because commands come from the listening tab, so `activeTab` never applies). Version 0.5.0.
- `parse.js`: new `browser` and `page` command types, matched before the question and small-talk rules so "what does this page say…" is not sent to chat.
- `browser.js` (new): the target tab lookup and the tab and page control actions.
- `page.js` (new): `snapshot()` and `act()`, the two functions injected into pages. They must be self-contained, since `executeScript` sends only the function source.
- `groq.js`: `groqPage()` and `checkPage()`; `groqTalk()` takes optional tab context.
- `popup.js`: routes the new types; holds a pending risky action and accepts the yes/no follow-up (in the listening tab without saying "Jarvis" again; in the Alt+J popup by listening once more).

## Testing

- `parse.test.js`: each new phrase maps to the right command, and existing phrases still match as before ("open YouTube", "what is the time", reminders).
- `groq.test.js`: `checkPage()` rejects unknown actions, ids not in the snapshot and missing `say`.
- `page.js` in a throwaway Chrome profile (the existing CDP test scripts): snapshot of a local test page, click, typing into a controlled input, password field refused, risky button asks first.
- Then you try it in your own Chrome after Reload at chrome://extensions.

## Out of scope

Multi-step tasks ("log in and open my orders"), screenshots or vision, controlling Chrome's own pages, and typing passwords or payment details. These can come later if the single-step version proves useful.

## Privacy note

Page text goes to Groq only when you give a page command or "summarize"/"what does this page say". Tab title and URL go to Groq with chat replies.
