"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("academic", {
  call: (method, args = {}) =>
    ipcRenderer.invoke("academic:call", { method, args }),
  onEvent: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("academic:event", listener);
    return () => ipcRenderer.removeListener("academic:event", listener);
  },
});
