// Minimal IndexedDB key/value store used by the background service worker to
// buffer a recording so an interruption doesn't lose the session.

const DB_NAME = 'sync-spike';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function kvPut(key: string, value: unknown): Promise<void> {
  await tx('readwrite', (s) => s.put(value as any, key));
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await tx('readonly', (s) => s.get(key))) as T | undefined;
}

export async function kvEntriesByPrefix<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out: Array<{ key: string; value: T }> = [];
    const t = db.transaction(STORE, 'readonly');
    const range = IDBKeyRange.bound(prefix, prefix + '￿');
    const cursorReq = t.objectStore(STORE).openCursor(range);
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result;
      if (cur) {
        out.push({ key: String(cur.key), value: cur.value as T });
        cur.continue();
      } else {
        resolve(out);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
    t.oncomplete = () => db.close();
  });
}

export async function kvClear(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
}
