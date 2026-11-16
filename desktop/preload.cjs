const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = ["expand", "toggle-wake", "ptt", "ext"];
contextBridge.exposeInMainWorld("jarvis", {
  win: (cmd) => ipcRenderer.invoke("win", cmd),
  expand: (open) => ipcRenderer.invoke("win", { action: "expand", arg: open }),
  on: (channel, fn) => CHANNELS.includes(channel) && ipcRenderer.on(channel, (_e, arg) => fn(arg)),
});
