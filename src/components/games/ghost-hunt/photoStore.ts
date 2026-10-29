/**
 * The diner's ghost photos, kept on their phone (IndexedDB).
 *
 * A share sheet that fails or gets dismissed must not cost them the photo —
 * posting it is how they claim the prize. So every snap is saved here first
 * and can be shared again from the hunt screen or the prize ticket, even after
 * a refresh. Nothing leaves the phone except through their own share.
 *
 * Best effort: a private window or blocked storage just means no history,
 * never a broken game.
 */

export type SavedPhoto = {
  id: string;
  blob: Blob;
  caption: string;
  /** Set when this photo is of the prize catch. */
  catchId: string | null;
  prizeName: string | null;
  name: string;
  atMs: number;
};

const DB = "shareat-ghost-hunt";
const STORE = "photos";
const KEEP = 12;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listPhotos(): Promise<SavedPhoto[]> {
  try {
    const db = await open();
    const all = await new Promise<SavedPhoto[]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as SavedPhoto[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return all.sort((a, b) => b.atMs - a.atMs);
  } catch {
    return [];
  }
}

/** Save a photo, keeping the newest few — but never dropping a prize photo. */
export async function savePhoto(p: SavedPhoto): Promise<void> {
  try {
    const existing = await listPhotos();
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(p);
    existing
      .filter((x) => !x.catchId)
      .slice(KEEP - 1)
      .forEach((x) => store.delete(x.id));
    await done(tx);
    db.close();
  } catch {}
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await done(tx);
    db.close();
  } catch {}
}
