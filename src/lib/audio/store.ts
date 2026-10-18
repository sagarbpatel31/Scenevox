import type { AudioAsset } from "./types";
export const AUDIO_LIMIT_BYTES = 50 * 1024 * 1024;
const DB_NAME = "scenevox-recordings";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("assets", { keyPath: "id" });
    request.onerror = () =>
      reject(
        new Error("Recording storage is unavailable. Download your WAV now."),
      );
    request.onblocked = () =>
      reject(new Error("Close other SceneVox tabs to open recording storage."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
export async function listAssets(): Promise<AudioAsset[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readonly"),
      request = tx.objectStore("assets").getAll();
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        new Error("Could not read recordings. Regeneration is available."),
      );
    };
  });
}
export async function saveAsset(asset: AudioAsset) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    // Size check and write share one transaction, including across browser tabs.
    const tx = db.transaction("assets", "readwrite"),
      store = tx.objectStore("assets");
    let message = "Recording could not be saved. Download your WAV now.";
    const request = store.getAll();
    request.onsuccess = () => {
      const total = (request.result as AudioAsset[]).reduce(
        (n, item) => n + (item.id === asset.id ? 0 : item.wav.size),
        0,
      );
      if (total + asset.wav.size > AUDIO_LIMIT_BYTES) {
        message =
          "50 MB recording limit reached. Download this WAV, then delete recordings to make room.";
        tx.abort();
      } else {
        try {
          store.put(asset);
        } catch {
          tx.abort();
        }
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error(message));
    };
  });
}
export async function deleteAsset(id: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error("Could not delete this recording."));
    };
  });
}
