"use client";

import type { OcrDocumentResult } from "./ocr-types";

const DATABASE = "inscription-ocr-v1";
const STORE = "documents";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "assetId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readOcrDocument(assetId: string) {
  const database = await openDatabase();
  const result = await new Promise<OcrDocumentResult | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(assetId);
    request.onsuccess = () => resolve(request.result as OcrDocumentResult | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

export async function saveOcrDocument(document: OcrDocumentResult) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ ...document, updatedAt: new Date().toISOString() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
