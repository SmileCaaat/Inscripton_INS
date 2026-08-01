"use client";

import type { BoardAsset } from "./reference-board";

const WORKSPACE_HANDLE_DB = "inscription-workspace-handles-v1";
const WORKSPACE_HANDLE_STORE = "directories";

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
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
  return typeof window !== "undefined" && Boolean(window.showDirectoryPicker);
}

export async function connectWorkspaceDirectory(workspaceId: string) {
  if (!window.showDirectoryPicker) return null;
  const handle = await window.showDirectoryPicker({
    id: `inscription-${workspaceId}`,
    mode: "readwrite",
  });
  if (!(await requestWritePermission(handle))) return null;
  await storeWorkspaceHandle(workspaceId, handle);
  return handle;
}

export async function workspaceDirectoryIsConnected(workspaceId: string) {
  const handle = await readWorkspaceDirectoryHandle(workspaceId);
  return handle ? hasWritePermission(handle) : false;
}

async function getWritableWorkspaceDirectory(workspaceId: string) {
  const handle = await readWorkspaceDirectoryHandle(workspaceId);
  if (!handle || !(await hasWritePermission(handle))) return null;
  return handle;
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

async function writeFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  contents: Blob | string,
) {
  const fileHandle = await directory.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function writeWorkspaceAssetFile(
  workspaceId: string,
  asset: Pick<BoardAsset, "name" | "path">,
  blob: Blob,
) {
  const root = await getWritableWorkspaceDirectory(workspaceId);
  if (!root) return false;
  const directory = await ensureDirectory(root, [
    "Assets",
    ...pathSegments(asset.path),
  ]);
  await writeFile(directory, asset.name, blob);
  return true;
}

export async function renameWorkspaceAssetFile(
  workspaceId: string,
  asset: Pick<BoardAsset, "name" | "path">,
  nextName: string,
) {
  const root = await getWritableWorkspaceDirectory(workspaceId);
  if (!root) return "unavailable" as const;
  try {
    const directory = await findDirectory(root, [
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
    await writeFile(directory, nextName, sourceFile);
    await directory.removeEntry(asset.name);
    return "renamed" as const;
  } catch {
    return "missing" as const;
  }
}

export async function createWorkspaceDeliveryDirectories(
  workspaceId: string,
  packageName: string,
  sourceAsset: BoardAsset,
  sourceCopyName: string,
  blob: Blob,
) {
  const root = await getWritableWorkspaceDirectory(workspaceId);
  if (!root) return false;
  const packageRoot = await ensureDirectory(root, [
    "Assets",
    "Deliveries",
    packageName,
  ]);
  const source = await ensureDirectory(packageRoot, ["Source"]);
  await ensureDirectory(packageRoot, ["Blender"]);
  const unity = await ensureDirectory(packageRoot, ["Unity"]);
  await ensureDirectory(unity, ["Models"]);
  await ensureDirectory(unity, ["Textures"]);
  await writeFile(source, sourceCopyName, blob);
  await writeFile(
    packageRoot,
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
