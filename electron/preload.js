const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  getDevices: () => ipcRenderer.invoke("get-devices"),
  getFolders: deviceId => ipcRenderer.invoke("get-folders", deviceId),

  copyFolder: (deviceId, folderPath, destName) =>
    ipcRenderer.send("copy-folder", { deviceId, folderPath, destName }),

  onProgress: cb => ipcRenderer.on("copy-progress", (_, d) => cb(d)),
  onFinished: cb => ipcRenderer.on("copy-finished", (_, d) => cb(d)),
  onError: cb => ipcRenderer.on("copy-error", (_, d) => cb(d)),
  onAdbLine: cb => ipcRenderer.on("adb-line", (_, d) => cb(d)),
  onAdbDebug: cb => ipcRenderer.on("adb-debug", (_, d) => cb(d)),
  onAdbMode: cb => ipcRenderer.on("adb-mode", (_, d) => cb(d))
});
