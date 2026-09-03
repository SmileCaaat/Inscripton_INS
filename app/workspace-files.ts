"use client";

import { getDesktopBridge } from "./desktop-bridge";
import type { BoardAsset } from "./reference-board";

const WORKSPACE_HANDLE_DB = "inscription-workspace-handles-v1";
const WORKSPACE_HANDLE_STORE = "directories";
const WORKSPACE_ROOTS_KEY = "inscription-workspace-roots-v1";

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
};

type FilePickerStartIn = FileSystemHandle | WellKnownDirectory;
type WellKnownDirectory =
  | "desktop"
  | "documents"
  | "downloads"
  | "music"
  | "pictures"
  | "videos";

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: FilePickerStartIn;
    }) => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker?: (options?: {
      id?: string;
      multiple?: boolean;
      startIn?: FilePickerStartIn;
    }) => Promise<FileSystemFileHandle[]>;
  }
}

function isUserAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function openHandleDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(WORKSPACE_HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WORKSPACE_HANDLE_STORE)) {
        request.result.createObjectStore(WORKSPACE_HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeWorkspaceHandle(
  workspaceId: string,
  handle: FileSystemDirectoryHandle,
) {
  const database = await openHandleDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      WORKSPACE_HANDLE_STORE,
      "readwrite",
    );
    transaction.objectStore(WORKSPACE_HANDLE_STORE).put(handle, workspaceId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readWorkspaceDirectoryHandle(workspaceId: string) {
  const database = await openHandleDatabase();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>(
    (resolve, reject) => {
      const transaction = database.transaction(
        WORKSPACE_HANDLE_STORE,
        "readonly",
      );
      const request = transaction
        .objectStore(WORKSPACE_HANDLE_STORE)
        .get(workspaceId);
      request.onsuccess = () =>
        resolve(request.result as FileSystemDirectoryHandle | undefined);
      request.onerror = () => reject(request.error);
    },
  );
  database.close();
  return handle;
}

function readWorkspaceRoots() {
  try {
    const stored = window.localStorage.getItem(WORKSPACE_ROOTS_KEY);
    if (!stored) return {} as Record<string, string>;
    const parsed = JSON.parse(stored) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {} as Record<string, string>;
  }
}

async function storeWorkspaceRoot(workspaceId: string, root: string) {
  const roots = readWorkspaceRoots();
  roots[workspaceId] = root;
  window.localStorage.setItem(WORKSPACE_ROOTS_KEY, JSON.stringify(roots));
}

export async function readWorkspaceRoot(workspaceId: string) {
  return readWorkspaceRoots()[workspaceId];
}

export function joinWorkspacePath(root: string, segments: string[]) {
  const separator = root.includes("\\") ? "\\" : "/";
  const trimmed = root.replace(/[\\/]+$/, "");
  return [trimmed, ...segments.filter(Boolean)].join(separator);
}

function pathSegments(path: string) {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(
      (segment) =>
        Boolean(segment) && segment !== "." && segment !== "..",
    );
}

export function workspaceAssetRelativePath(
  asset: Pick<BoardAsset, "name" | "path">,
) {
  return ["Assets", ...pathSegments(asset.path), asset.name].join("/");
}

export async function workspaceAssetLocalPath(
  workspaceId: string,
  asset: Pick<BoardAsset, "name" | "path">,
) {
  const root = await readWorkspaceRoot(workspaceId);
  if (!root) return undefined;
  return joinWorkspacePath(root, [
    "Assets",
    ...pathSegments(asset.path),
    asset.name,
  ]);
}

async function hasWritePermission(handle: FileSystemDirectoryHandle) {
  const writable = handle as WritableDirectoryHandle;
  if (!writable.queryPermission) return true;
  return (await writable.queryPermission({ mode: "readwrite" })) === "granted";
}

async function requestWritePermission(handle: FileSystemDirectoryHandle) {
  const writable = handle as WritableDirectoryHandle;
  if (await hasWritePermission(handle)) return true;
  if (!writable.requestPermission) return false;
  return (
    (await writable.requestPermission({ mode: "readwrite" })) === "granted"
  );
}

export function supportsWorkspaceDirectoryAccess() {
  return (
    typeof window !== "undefined" &&
    (Boolean(window.showDirectoryPicker) ||
      Boolean(getDesktopBridge()?.chooseDirectory))
  );
}

export async function connectWorkspaceDirectory(workspaceId: string) {
  const desktop = getDesktopBridge();
  if (desktop?.chooseDirectory) {
    const root = await desktop.chooseDirectory();
    if (!root) return false;
    await storeWorkspaceRoot(workspaceId, root);
    return true;
  }
  if (!window.showDirectoryPicker) return false;
  const handle = await window.showDirectoryPicker({
    id: `inscription-${workspaceId}`,
    mode: "readwrite",
  });
  if (!(await requestWritePermission(handle))) return false;
  await storeWorkspaceHandle(workspaceId, handle);
  return true;
}

export async function workspaceDirectoryIsConnected(workspaceId: string) {
  if (await readWorkspaceRoot(workspaceId)) return true;
  const handle = await readWorkspaceDirectoryHandle(workspaceId);
  return handle ? hasWritePermission(handle) : false;
}

async function getWritableWorkspaceDirectory(workspaceId: string) {
  const handle = await readWorkspaceDirectoryHandle(workspaceId);
  if (!handle || !(await hasWritePermission(handle))) return null;
  return handle;
}

async function ensureDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
) {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

async function findDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
) {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment);
  }
  return current;
}

async function writeBrowserFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  contents: Blob | string,
) {
  const fileHandle = await directory.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

async function writeWorkspaceRelative(
  workspaceId: string,
  segments: string[],
  name: string,
  contents: Blob | string,
) {
  const root = await readWorkspaceRoot(workspaceId);
  const desktop = getDesktopBridge();
  if (root && desktop?.writeFile) {
    const relative = [...segments, name].join("/");
    const blob =
      typeof contents === "string" ? new Blob([contents]) : contents;
    await desktop.writeFile(root, relative, await blob.arrayBuffer());
    return true;
  }
  const handle = await getWritableWorkspaceDirectory(workspaceId);
  if (!handle) return false;
  const directory = await ensureDirectory(handle, segments);
  await writeBrowserFile(directory, name, contents);
  return true;
}

export async function writeWorkspaceAssetFile(
  workspaceId: string,
  asset: Pick<BoardAsset, "name" | "path">,
  blob: Blob,
) {
  return writeWorkspaceRelative(
    workspaceId,
    ["Assets", ...pathSegments(asset.path)],
    asset.name,
    blob,
  );
}

export async function renameWorkspaceAssetFile(
  workspaceId: string,
  asset: Pick<BoardAsset, "name" | "path">,
  nextName: string,
) {
  const root = await readWorkspaceRoot(workspaceId);
  const desktop = getDesktopBridge();
  if (root && desktop?.renameFile) {
    const folder = ["Assets", ...pathSegments(asset.path)].join("/");
    const result = await desktop.renameFile(
      root,
      `${folder}/${asset.name}`,
      `${folder}/${nextName}`,
    );
    if (result.ok) return "renamed" as const;
    if (result.reason === "conflict") return "conflict" as const;
    return "missing" as const;
  }
  const handle = await getWritableWorkspaceDirectory(workspaceId);
  if (!handle) return "unavailable" as const;
  try {
    const directory = await findDirectory(handle, [
      "Assets",
      ...pathSegments(asset.path),
    ]);
    try {
      await directory.getFileHandle(nextName);
      return "conflict" as const;
    } catch {
      // The destination is available.
    }
    const sourceHandle = await directory.getFileHandle(asset.name);
    const sourceFile = await sourceHandle.getFile();
    await writeBrowserFile(directory, nextName, sourceFile);
    await directory.removeEntry(asset.name);
    return "renamed" as const;
  } catch {
    return "missing" as const;
  }
}

export type RevealAssetResult =
  | { ok: true; via: "explorer" | "picker" }
  | { ok: false; reason: "missing" | "unsupported" | "unavailable" };

async function getReadableWorkspaceDirectory(workspaceId: string) {
  const handle = await readWorkspaceDirectoryHandle(workspaceId);
  if (!handle) return null;
  if (await requestWritePermission(handle)) return handle;
  return null;
}

async function resolveRevealStartHandle(
  root: FileSystemDirectoryHandle,
  asset: Pick<BoardAsset, "name" | "path">,
) {
  try {
    const folder = await findDirectory(root, [
      "Assets",
      ...pathSegments(asset.path),
    ]);
    try {
      return await folder.getFileHandle(asset.name);
    } catch {
      return folder;
    }
  } catch {
    try {
      return await root.getDirectoryHandle("Assets");
    } catch {
      return root;
    }
  }
}

async function openBrowserFileLocation(
  startIn: FileSystemHandle,
  workspaceId: string,
) {
  try {
    if (window.showOpenFilePicker) {
      await window.showOpenFilePicker({
        id: `inscription-reveal-${workspaceId}`,
        startIn,
        multiple: false,
      });
      return true;
    }
    if (window.showDirectoryPicker) {
      const directory =
        startIn.kind === "directory"
          ? (startIn as FileSystemDirectoryHandle)
          : undefined;
      await window.showDirectoryPicker({
        id: `inscription-reveal-${workspaceId}`,
        startIn: directory ?? startIn,
      });
      return true;
    }
    return false;
  } catch (error) {
    if (isUserAbort(error)) return true;
    throw error;
  }
}

async function revealLocalAssetInBrowser(
  workspaceId: string,
  asset: Pick<BoardAsset, "name" | "path">,
): Promise<RevealAssetResult> {
  if (!window.showOpenFilePicker && !window.showDirectoryPicker) {
    return { ok: false, reason: "unsupported" };
  }
  const root = await getReadableWorkspaceDirectory(workspaceId);
  if (!root) return { ok: false, reason: "unavailable" };
  const startIn = await resolveRevealStartHandle(root, asset);
  const opened = await openBrowserFileLocation(startIn, workspaceId);
  return opened
    ? { ok: true, via: "picker" }
    : { ok: false, reason: "unsupported" };
}

export async function revealLocalAsset(
  workspaceId: string,
  asset: Pick<BoardAsset, "name" | "path" | "localPath">,
): Promise<RevealAssetResult> {
  const desktop = getDesktopBridge();
  if (desktop?.revealInFolder) {
    const candidates = [
      asset.localPath,
      await workspaceAssetLocalPath(workspaceId, asset),
    ].filter((value): value is string => Boolean(value));
    for (const candidate of candidates) {
      const result = await desktop.revealInFolder(candidate);
      if (result.ok) return { ok: true, via: "explorer" };
    }
    if (candidates.length > 0) return { ok: false, reason: "missing" };
  }
  return revealLocalAssetInBrowser(workspaceId, asset);
}

export async function createWorkspaceDeliveryDirectories(
  workspaceId: string,
  packageName: string,
  sourceAsset: BoardAsset,
  sourceCopyName: string,
  blob: Blob,
) {
  const wroteSource = await writeWorkspaceRelative(
    workspaceId,
    ["Assets", "Deliveries", packageName, "Source"],
    sourceCopyName,
    blob,
  );
  if (!wroteSource) return false;
  const root = await readWorkspaceRoot(workspaceId);
  const desktop = getDesktopBridge();
  if (root && desktop?.ensureDir) {
    await desktop.ensureDir(
      root,
      `Assets/Deliveries/${packageName}/Blender`,
    );
    await desktop.ensureDir(
      root,
      `Assets/Deliveries/${packageName}/Unity/Models`,
    );
    await desktop.ensureDir(
      root,
      `Assets/Deliveries/${packageName}/Unity/Textures`,
    );
  } else {
    const handle = await getWritableWorkspaceDirectory(workspaceId);
    if (handle) {
      await ensureDirectory(handle, [
        "Assets",
        "Deliveries",
        packageName,
        "Blender",
      ]);
      await ensureDirectory(handle, [
        "Assets",
        "Deliveries",
        packageName,
        "Unity",
        "Models",
      ]);
      await ensureDirectory(handle, [
        "Assets",
        "Deliveries",
        packageName,
        "Unity",
        "Textures",
      ]);
    }
  }
  await writeWorkspaceRelative(
    workspaceId,
    ["Assets", "Deliveries", packageName],
    "INS_delivery.json",
    JSON.stringify(
      {
        version: 1,
        name: packageName,
        sourceAssetId: sourceAsset.id,
        sourceAssetName: sourceAsset.name,
        sourceCopy: `Source/${sourceCopyName}`,
        blenderFolder: "Blender/",
        unityModelsFolder: "Unity/Models/",
        unityTexturesFolder: "Unity/Textures/",
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  return true;
}
