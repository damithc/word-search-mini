// Stores voice recordings on this device only (IndexedDB). They are never uploaded.
// Each recording is kept as { data: ArrayBuffer, type: string }, keyed by clip id.

const DB_NAME = 'word-search';
const STORE = 'recordings';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

// Returns a Map of clip id -> { data, type }.
export async function loadRecordings() {
  const recordings = new Map();
  await transact('readonly', (store) => {
    store.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      recordings.set(cursor.key, cursor.value);
      cursor.continue();
    };
  });
  return recordings;
}

export function saveRecording(id, recording) {
  return transact('readwrite', (store) => { store.put(recording, id); });
}

export function deleteRecording(id) {
  return transact('readwrite', (store) => { store.delete(id); });
}

// Asks the browser not to clear the recordings when the device is low on space.
export function keepRecordings() {
  navigator.storage?.persist?.().catch(() => {});
}
