/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDevelopment = !app.isPackaged;
const developmentUrl =
  process.env.INS_DESKTOP_DEV_URL || "http://localhost:3000";

app.setName("INS Studio");
app.setAppUserModelId("com.inscription.studio");

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

function resolveInsideWorkspace(root, relativePath) {
  const rootResolved = path.resolve(String(root));
  const parts = String(relativePath)
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
  const full = path.resolve(rootResolved, ...parts);
  const prefix = rootResolved.endsWith(path.sep)
    ? rootResolved
    : `${rootResolved}${path.sep}`;
  if (full !== rootResolved && !full.startsWith(prefix)) {
    throw new Error("Path escapes workspace");
  }
  return full;
}

function createWindow() {
  const iconPath = isDevelopment
    ? path.join(__dirname, "..", "public", "ins-logo.png")
    : path.join(process.resourcesPath, "ins-logo.png");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    title: "INS Studio",
    backgroundColor: "#f4f2eb",
    icon: iconPath,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (currentUrl && url !== currentUrl) {
      event.preventDefault();
      if (/^https?:/i.test(url)) {
        void shell.openExternal(url);
      }
    }
  });

  mainWindow.webContents.on("context-menu", (event) => {
    event.preventDefault();
  });

  if (isDevelopment) {
    void mainWindow.loadURL(developmentUrl);
    if (process.env.INS_DESKTOP_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void mainWindow.loadFile(
      path.join(process.resourcesPath, "dist-desktop", "index.html"),
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  ipcMain.handle("ins:choose-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: "选择 INS 工作区目录",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("ins:reveal-in-folder", async (_event, filePath) => {
    if (typeof filePath !== "string" || !filePath.trim()) {
      return { ok: false, reason: "unavailable" };
    }
    try {
      await fs.access(filePath);
      shell.showItemInFolder(filePath);
      return { ok: true };
    } catch {
      const directory = path.dirname(filePath);
      try {
        await fs.access(directory);
        shell.showItemInFolder(directory);
        return { ok: true, reason: "folder" };
      } catch {
        return { ok: false, reason: "missing" };
      }
    }
  });

  ipcMain.handle("ins:ensure-dir", async (_event, root, relativePath) => {
    const full = resolveInsideWorkspace(root, relativePath);
    await fs.mkdir(full, { recursive: true });
    return full;
  });

  ipcMain.handle("ins:write-file", async (_event, root, relativePath, data) => {
    const full = resolveInsideWorkspace(root, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, Buffer.from(data));
    return full;
  });

  ipcMain.handle(
    "ins:rename-file",
    async (_event, root, fromRelative, toRelative) => {
      const from = resolveInsideWorkspace(root, fromRelative);
      const to = resolveInsideWorkspace(root, toRelative);
      try {
        await fs.access(to);
        return { ok: false, reason: "conflict" };
      } catch {
        // Destination is available.
      }
      try {
        await fs.rename(from, to);
        return { ok: true };
      } catch {
        return { ok: false, reason: "missing" };
      }
    },
  );

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
