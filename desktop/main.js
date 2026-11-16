// The orb: a small always-on-top window in the corner that grows into a panel, a tray menu, and the Windows commands.
import { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, shell, screen, session, nativeImage } from "electron";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { WebSocketServer } from "ws";
import { pick } from "./win.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ORB = 96; // window size when collapsed: an 72px orb plus room for its glow
const PANEL = { width: 380, height: 560 };
let win, tray;
let wake = false; // mirrors the renderer's "Listen for Jarvis" setting, for the tray checkbox

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => send("expand", true));
app.setAppUserModelId("Jarvis.Desktop"); // Windows needs it to show notifications

const send = (channel, arg) => win?.webContents.send(channel, arg);

// Where you dragged the orb (its window's top-left when folded), kept across restarts; null = bottom-right corner.
const posFile = () => path.join(app.getPath("userData"), "orb.json");
let orbAt = null;
try {
  orbAt = JSON.parse(fs.readFileSync(posFile(), "utf8"));
} catch {}
let isOpen = false;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
function place(open) {
  isOpen = open;
  const main = screen.getPrimaryDisplay().workArea;
  const at = orbAt ?? { x: main.x + main.width - ORB - 12, y: main.y + main.height - ORB - 12 };
  const area = screen.getDisplayNearestPoint(at).workArea;
  const { width, height } = open ? PANEL : { width: ORB, height: ORB };
  // The panel grows up and left from the orb, shifted only as far as it takes to stay on screen.
  win.setBounds({
    x: clamp(at.x + ORB - width, area.x, area.x + area.width - width),
    y: clamp(at.y + ORB - height, area.y, area.y + area.height - height),
    width,
    height,
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: ORB,
    height: ORB,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    icon: path.join(dir, "..", "icon.png"),
    webPreferences: {
      preload: path.join(dir, "preload.cjs"),
      backgroundThrottling: false, // it has to keep listening while hidden behind other windows
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  win.setAlwaysOnTop(true, "floating");
  place(false);
  win.loadFile(path.join(dir, "index.html"));
  win.once("ready-to-show", () => win.showInactive());
}

const LOGIN = { path: process.execPath, args: [app.getAppPath()] };
function buildTray() {
  tray ??= new Tray(nativeImage.createFromPath(path.join(dir, "..", "icon.png")));
  tray.setToolTip("Jarvis (Ctrl+Alt+J)");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: () => send("expand", true) },
      { label: 'Listen for "Jarvis"', type: "checkbox", checked: wake, click: () => send("toggle-wake") },
      {
        label: "Start with Windows",
        type: "checkbox",
        checked: app.getLoginItemSettings(LOGIN).openAtLogin,
        click: (item) => app.setLoginItemSettings({ ...LOGIN, openAtLogin: item.checked }),
      },
      {
        label: "Put the orb back in the corner",
        click: () => {
          orbAt = null;
          fs.rm(posFile(), { force: true }, () => {});
          place(isOpen);
        },
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => send("expand", true));
}

// ---- Windows commands. Every argument comes from the renderer, so each one is checked here. ----
const run = (file, args) =>
  new Promise((resolve, reject) =>
    execFile(file, args, { windowsHide: true, maxBuffer: 8 << 20 }, (err, out) => (err ? reject(err) : resolve(out))),
  );
const ps = (script) => run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
const KEY = { mute: 173, down: 174, up: 175, next: 176, prev: 177, play: 179 };
// Media and volume keys, pressed and released as real key events (SendKeys can't send them on every keyboard layout). One volume step is 2%.
const keys = (list) =>
  ps(`Add-Type 'using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, int f, int e); }'
${list.map(([k, n]) => `1..${n} | % { [K]::keybd_event(${KEY[k]}, 0, 0, 0); [K]::keybd_event(${KEY[k]}, 0, 2, 0) }`).join("\n")}`);
// The exact master volume, through the Windows audio endpoint API.
const setVolume = (pct) =>
  ps(`Add-Type @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int a(); int b(); int c(); int d(); int SetMasterVolumeLevelScalar(float level, System.Guid ctx); int e(); int f(); int g(); int h(); int i(); int j(); int SetMute(bool mute, System.Guid ctx); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int ctx, int p, out IAudioEndpointVolume v); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator {}
public class Vol { public static void Set(float x) {
  IMMDevice d; ((IMMDeviceEnumerator)new Enumerator()).GetDefaultAudioEndpoint(0, 1, out d);
  IAudioEndpointVolume v; var id = typeof(IAudioEndpointVolume).GUID; d.Activate(ref id, 23, 0, out v);
  v.SetMute(false, System.Guid.Empty); v.SetMasterVolumeLevelScalar(x, System.Guid.Empty);
} }
'@
[Vol]::Set(${pct / 100})`);

let apps; // the Start menu, read once: Get-StartApps takes a second or two
const startApps = async () => (apps ??= [].concat(JSON.parse((await ps("Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress")) || "[]")));

const BROWSERS = /^(?:chrome|msedge|firefox|brave|opera|vivaldi)$/i;
async function closeApp(spoken) {
  const list = [].concat(
    JSON.parse(
      (await ps("Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Id, ProcessName, MainWindowTitle, Description | ConvertTo-Json -Compress")) ||
        "[]",
    ),
  ).filter((p) => p.Id !== process.pid && !/^electron$/i.test(p.ProcessName));
  // A browser goes only by its own name: "close youtube" must not close all of Chrome because a tab is called YouTube.
  const names = (p) => (BROWSERS.test(p.ProcessName) ? [p.ProcessName, p.Description] : [p.Description, p.ProcessName, p.MainWindowTitle]);
  const hit = pick(list, spoken, names);
  if (!hit) return null;
  const ids = list.filter((p) => p.ProcessName === hit.ProcessName).map((p) => Number(p.Id)).filter(Number.isInteger);
  await ps(ids.map((id) => `(Get-Process -Id ${id} -ErrorAction SilentlyContinue).CloseMainWindow() | Out-Null`).join("; "));
  return (hit.Description || hit.ProcessName).replace(/\.exe$/i, "");
}

// Chromium here only sees Windows' OneCore voices (just Russian on this PC); System.Speech also has the English
// desktop voices such as Zira, so Jarvis never reads English with a Russian voice.
let talker = null;
function sayEnglish(text) {
  talker?.kill();
  const p = (talker = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "[Console]::InputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
    "$v = $s.GetInstalledVoices() | ? { $_.VoiceInfo.Culture.Name -like 'en*' } | select -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.Rate = 1; $s.Speak([Console]::In.ReadToEnd())"],
    { windowsHide: true }));
  p.stdin.end(text);
  return new Promise((r) => p.on("exit", () => ((talker === p && (talker = null)), r())));
}

const FOLDERS = ["downloads", "documents", "desktop", "pictures", "music", "videos"];
const str = (x) => typeof x === "string" && x.length > 0 && x.length < 200;

async function winCmd({ action, arg } = {}) {
  switch (action) {
    case "mute":
    case "next":
    case "prev":
    case "play":
      return keys([[action, 1]]);
    case "louder":
    case "quieter":
      return keys([[action === "louder" ? "up" : "down", 5]]);
    case "volume":
      if (!Number.isInteger(arg) || arg < 0 || arg > 100) throw new Error("bad volume");
      return setVolume(arg);
    case "lock":
      return run("rundll32.exe", ["user32.dll,LockWorkStation"]);
    case "desktop":
      return ps("(New-Object -ComObject Shell.Application).MinimizeAll()");
    case "shutdown":
    case "restart":
      return run("shutdown.exe", [action === "shutdown" ? "/s" : "/r", "/t", "5"]);
    case "sleep":
      return ps("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)");
    case "folder":
      if (!FOLDERS.includes(arg)) throw new Error("bad folder");
      return shell.openPath(app.getPath(arg));
    case "openApp": {
      if (!str(arg)) throw new Error("bad name");
      const hit = pick(await startApps(), arg, (a) => [a.Name]);
      if (!hit) return null;
      await run("explorer.exe", [`shell:AppsFolder\\${hit.AppID}`]).catch(() => {}); // explorer exits 1 even when it worked
      return hit.Name;
    }
    case "closeApp":
      if (!str(arg)) throw new Error("bad name");
      return closeApp(arg);
    case "url":
      if (!str(arg) || !/^https?:\/\//i.test(arg)) throw new Error("bad url");
      return shell.openExternal(arg);
    case "status": {
      const busy = () => os.cpus().reduce((t, c) => ((t.idle += c.times.idle), (t.all += Object.values(c.times).reduce((a, b) => a + b)), t), { idle: 0, all: 0 });
      const a = busy();
      await new Promise((r) => setTimeout(r, 500));
      const b = busy();
      return { cpu: 1 - (b.idle - a.idle) / (b.all - a.all || 1), memUsed: os.totalmem() - os.freemem(), memTotal: os.totalmem(), uptime: os.uptime() };
    }
    case "say":
      if (typeof arg !== "string" || arg.length > 5000) throw new Error("bad text");
      return sayEnglish(arg);
    case "hush":
      talker?.kill();
      talker = null;
      return;
    case "move": {
      const { dx, dy } = arg ?? {};
      if (![dx, dy].every((n) => Number.isFinite(n) && Math.abs(n) < 5000)) throw new Error("bad move");
      const [x, y] = win.getPosition();
      return win.setPosition(Math.round(x + dx), Math.round(y + dy));
    }
    case "moved": {
      const [x, y] = win.getPosition();
      orbAt = isOpen ? { x: x + PANEL.width - ORB, y: y + PANEL.height - ORB } : { x, y };
      return fs.promises.writeFile(posFile(), JSON.stringify(orbAt));
    }
    case "heard": {
      // Local only: the last few hundred phrases, to find words it keeps getting wrong.
      if (typeof arg !== "string" || arg.length > 1000) throw new Error("bad text");
      const file = path.join(app.getPath("userData"), "heard.log");
      const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").slice(-300) : [];
      return fs.promises.writeFile(file, [...old, `${new Date().toISOString()}  ${arg.replace(/\s+/g, " ")}`].join("\n"));
    }
    case "ext":
      return toExt(arg);
    case "extHello":
      return extHello;
    case "expand":
      if (win.isDestroyed()) return;
      place(!!arg);
      win.showInactive(); // a reminder or reply must not steal the keyboard from what you're typing in
      return;
    case "wake":
      wake = !!arg;
      return buildTray();
    default:
      throw new Error(`unknown action ${action}`);
  }
}

// ---- Link to the Chrome extension: its listening tab joins this socket, hands the microphone over, and runs
// the tab and page commands we pass it. Only that extension may join: the browser sets Origin and pages can't fake it.
const EXT_ORIGIN = "chrome-extension://ghjpbnmifagnijgpmcjkfbcjkdejmhfm"; // pinned by "key" in ../manifest.json
const LINK_PORT = 47621;
let ext = null;
let extHello = null; // the extension's last hello, for a window that loads after it arrived
function startLink() {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: LINK_PORT, maxPayload: 1 << 20, verifyClient: ({ origin }) => origin === EXT_ORIGIN });
  wss.on("error", (e) => console.error("Chrome link unavailable:", e.message)); // e.g. another copy holds the port
  wss.on("connection", (s) => {
    ext?.close();
    ext = s;
    s.on("message", (d) => {
      let m;
      try {
        m = JSON.parse(String(d));
      } catch {
        return;
      }
      if (m?.type === "hello") extHello = m;
      send("ext", m);
    });
    s.on("close", () => {
      if (ext !== s) return;
      ext = extHello = null;
      send("ext", { type: "down" });
    });
  });
}
const OUT = { cmd: ["text"], key: ["key"], ended: ["rid"] }; // what the window may send to Chrome, and its string fields
function toExt(m) {
  const fields = OUT[m?.type];
  if (!fields || !fields.every((f) => str(m[f]) || (f === "key" && typeof m[f] === "string" && m[f].length < 400))) throw new Error("bad message");
  if (!ext) return false;
  ext.send(JSON.stringify(Object.fromEntries(["type", ...fields].map((f) => [f, m[f]]))));
  return true;
}

app.whenReady().then(() => {
  startLink();
  // Microphone for listening, notifications for reminders; nothing else.
  const allowed = (p) => p === "media" || p === "notifications";
  session.defaultSession.setPermissionRequestHandler((_wc, p, cb) => cb(allowed(p)));
  session.defaultSession.setPermissionCheckHandler((_wc, p) => allowed(p));
  ipcMain.handle("win", (e, cmd) => {
    if (e.sender !== win.webContents) throw new Error("not the orb");
    return winCmd(cmd);
  });
  createWindow();
  buildTray();
  globalShortcut.register("Control+Alt+J", () => send("ptt")); // Alt+J stays with the Chrome extension
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
