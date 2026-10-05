const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("alt", {
  onFound: (fn) => ipcRenderer.on("found", (_e, data) => fn(data)),
  command: (a, d) => ipcRenderer.invoke("command", a, d),
  onNavigate: (fn) => ipcRenderer.on("navigating", (_e, d) => fn(d)),
  onState: (fn) => ipcRenderer.on("state", (_e, s) => fn(s)),
  onShortcut: (fn) => ipcRenderer.on("shortcut", (_e, a) => fn(a)),
  onReader: (fn) => ipcRenderer.on("reader", (_e, t) => fn(t)),
});
