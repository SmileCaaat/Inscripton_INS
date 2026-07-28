"use client";

const LOCAL_ASSET_DB = "inscription-local-assets-v1";
const LOCAL_ASSET_STORE = "blobs";

function openLocalAssetDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(LOCAL_ASSET_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LOCAL_ASSET_STORE)) {
        request.result.createObjectStore(LOCAL_ASSET_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeLocalAssetBlob(assetId: string, blob: Blob) {
  const database = await openLocalAssetDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LOCAL_ASSET_STORE, "readwrite");
    transaction.objectStore(LOCAL_ASSET_STORE).put(blob, assetId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readLocalAssetBlob(assetId: string) {
  const database = await openLocalAssetDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const transaction = database.transaction(LOCAL_ASSET_STORE, "readonly");
    const request = transaction.objectStore(LOCAL_ASSET_STORE).get(assetId);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return blob;
}
