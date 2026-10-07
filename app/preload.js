const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("luauCoder", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveProviderSettings: (settings) => ipcRenderer.invoke("settings:saveProvider", settings),
  testProviderConnection: () => ipcRenderer.invoke("provider:test"),
  setStudioContext: (enabled) => ipcRenderer.invoke("settings:setStudioContext", enabled),
  sendMessage: (messages) => ipcRenderer.invoke("assistant:send", messages),
  getStudioState: () => ipcRenderer.invoke("studio:getState"),
  applyCode: (code) => ipcRenderer.invoke("studio:applyCode", code),
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  onStudioUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("plugin:update", listener);
    return () => ipcRenderer.removeListener("plugin:update", listener);
  },
});
