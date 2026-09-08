/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const http = require("node:http");
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
/** Packaged UI is served over localhost so MapLibre can load online basemap tiles. */
let packagedAppOrigin = null;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function startPackagedStaticServer(rootDirectory) {
  const rootResolved = path.resolve(rootDirectory);
  const rootPrefix = rootResolved.endsWith(path.sep)
    ? rootResolved
    : `${rootResolved}${path.sep}`;

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      let relativePath = decodeURIComponent(requestUrl.pathname);
      if (relativePath === "/" || relativePath === "") {
        relativePath = "/index.html";
      }
      const fullPath = path.resolve(rootResolved, `.${relativePath}`);
      if (fullPath !== rootResolved && !fullPath.startsWith(rootPrefix)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const data = await fs.readFile(fullPath);
      response.writeHead(200, {
        "Content-Type": contentTypeFor(fullPath),
        "Cache-Control": "no-cache",
      });
      response.end(data);
    } catch {
      response.writeHead(404).end("Not Found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind packaged static server"));
        return;
      }
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

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
    if (packagedAppOrigin && url.startsWith(packagedAppOrigin)) {
      return;
    }
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
  } else if (packagedAppOrigin) {
    // Prefer http://127.0.0.1 over file:// so MapLibre basemap tile fetches work.
    void mainWindow.loadURL(`${packagedAppOrigin}/index.html`);
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

app.whenReady().then(async () => {
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

  if (!isDevelopment) {
    try {
      const { origin } = await startPackagedStaticServer(
        path.join(process.resourcesPath, "dist-desktop"),
      );
      packagedAppOrigin = origin;
    } catch (error) {
      console.error("Failed to start packaged UI server", error);
      packagedAppOrigin = null;
    }
  }

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
