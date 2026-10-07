const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("luauCoder", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveApiKey: (key) => ipcRenderer.invoke("settings:setApiKey", key),
  setStudioContext: (enabled) => ipcRenderer.invoke("settings:setStudioContext", enabled),
  sendMessage: (prompt) => ipcRenderer.invoke("assistant:send", prompt),
  getStudioState: () => ipcRenderer.invoke("studio:getState"),
  applyCode: (code) => ipcRenderer.invoke("studio:applyCode", code),
  onStudioUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("plugin:update", listener);
    return () => ipcRenderer.removeListener("plugin:update", listener);
  },
});
