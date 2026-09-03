/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "insDesktop",
  Object.freeze({
    isDesktop: true,
    platform: process.platform,
    versions: Object.freeze({
      electron: process.versions.electron,
      chrome: process.versions.chrome,
    }),
    chooseDirectory: () => ipcRenderer.invoke("ins:choose-directory"),
    revealInFolder: (filePath) =>
      ipcRenderer.invoke("ins:reveal-in-folder", filePath),
    ensureDir: (root, relativePath) =>
      ipcRenderer.invoke("ins:ensure-dir", root, relativePath),
    writeFile: (root, relativePath, data) =>
      ipcRenderer.invoke("ins:write-file", root, relativePath, data),
    renameFile: (root, fromRelative, toRelative) =>
      ipcRenderer.invoke("ins:rename-file", root, fromRelative, toRelative),
  }),
);
