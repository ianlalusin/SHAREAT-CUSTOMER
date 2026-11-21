import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminBucket } from "@/lib/firebase/admin";
import { readGameConfigs } from "@/lib/server/games/config";
import { isGameConfigured, isGameEnabledForStore } from "@/lib/games/gameScope";
import { CONSENT_TEXT } from "@/lib/games/capture-share/layouts";

/**
 * Consented Capture & Share photos.
 *
 * Only photos a diner ticked "you may post this" on are stored; everything
 * else stays on their phone. Firestore `stores/{storeId}/captureSharePhotos/{id}`
 * (a subcollection, so newest-first needs no composite index) + Storage
 * `captureShare/{storeId}/{id}.jpg`, both written and read ONLY through the
 * admin SDK in this app's API routes — no client rules needed (rules live in POS).
 */

export const GAME_ID = "capture-share";
const col = (db: Firestore, storeId: string) => db.collection(`stores/${storeId}/captureSharePhotos`);
export const MAX_BYTES = 4 * 1024 * 1024;
/** Per table session. Stops a stuck retry loop or a prankster filling the bucket. */
export const MAX_PER_SESSION = 20;

/**
 * Whether guests may send photos to the cashier's printer. A chain-wide admin
 * switch (`miniGames/capture-share.printingEnabled`), separate from the game's
 * on/off: printing can be paused (printer down, out of paper) while the photo
 * booth keeps running. Absent means on.
 */
export async function isPrintingEnabled(db: Firestore, storeId: string): Promise<boolean> {
  const snap = await db.doc(`miniGames/${GAME_ID}`).get();
  return printingOnAt(snap.data(), storeId);
}

/**
 * Printing at one branch: the chain-wide switch must be on, and the branch must not
 * be in `printingDisabledStoreIds` (per-branch off: no printer, out of paper…).
 * Subtractive like the game's own disabledStoreIds, so a new branch prints by default.
 */
export function printingOnAt(cfg: { printingEnabled?: unknown; printingDisabledStoreIds?: unknown } | undefined, storeId: string): boolean {
  if (cfg?.printingEnabled === false) return false;
  const off = Array.isArray(cfg?.printingDisabledStoreIds) ? cfg.printingDisabledStoreIds : [];
  return !off.includes(storeId);
}

export async function isCaptureShareLive(db: Firestore, storeId: string): Promise<boolean> {
  const cfg = (await readGameConfigs(db))[GAME_ID];
  return isGameConfigured(cfg) && isGameEnabledForStore(cfg, storeId);
}

/** Pure checks on an upload, testable without Firebase. Returns an error or null. */
export function validateUpload(bytes: Uint8Array, photoId: string): string | null {
  if (!/^[A-Za-z0-9-]{6,40}$/.test(photoId)) return "Bad photo id.";
  if (bytes.length < 1024) return "Photo is empty.";
  if (bytes.length > MAX_BYTES) return "Photo is too large.";
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return "Only JPEG photos are accepted.";
  // A complete JPEG also ends with the End-Of-Image marker (canvas.toBlob always writes it).
  // Together with the start marker this rejects truncated uploads and most non-image
  // payloads that only borrow the first three bytes (audit CUSTOMER-03).
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return "Only complete JPEG photos are accepted.";
  return null;
}

/**
 * Read a request body but stop as soon as it passes `limit` bytes, so a missing or
 * false Content-Length cannot make the server buffer an oversized body before the
 * size check (audit CUSTOMER-03). Returns null when the body is too large.
 */
export async function readBodyLimited(req: Request, limit = MAX_BYTES): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export type ConsentedPhotoInput = {
  storeId: string;
  storeName: string;
  sessionId: string;
  identityKey: string;
  tableDisplayName: string;
  photoId: string;
  layout: string;
  bytes: Uint8Array;
};

/** Store one consented photo. Idempotent per (session, photoId): a retry is a no-op. */
export async function saveConsentedPhoto(db: Firestore, p: ConsentedPhotoInput): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const id = `${p.sessionId}_${p.photoId}`;
  const ref = col(db, p.storeId).doc(id);
  if ((await ref.get()).exists) return { ok: true };

  const used = (await col(db, p.storeId).where("sessionId", "==", p.sessionId).count().get()).data().count;
  if (used >= MAX_PER_SESSION) return { ok: false, status: 429, error: "This table has saved the most photos allowed." };

  const path = `captureShare/${p.storeId}/${id}.jpg`;
  const file = getAdminBucket().file(path);
  await file.save(Buffer.from(p.bytes), { contentType: "image/jpeg", resumable: false });

  try {
    await ref.create({
      storeId: p.storeId,
      storeName: p.storeName,
      sessionId: p.sessionId,
      identityKey: p.identityKey,
      tableDisplayName: p.tableDisplayName,
      layout: p.layout.slice(0, 20),
      path,
      sizeBytes: p.bytes.length,
      consentText: CONSENT_TEXT,
      consentAtMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // ALREADY_EXISTS: a parallel retry won the race and wrote the same file. Fine.
    if ((e as { code?: number })?.code !== 6) {
      // No record will point at this file, so nobody could find or delete it. Remove it.
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      throw e;
    }
  }
  return { ok: true };
}

export type ConsentedPhotoRow = {
  id: string;
  tableDisplayName: string;
  layout: string;
  consentAtMs: number;
  /** Signed for an hour. Served as an attachment, which still renders in <img>. */
  url: string;
};

/** One branch's consented photos, newest first, with short-lived signed links. */
export async function listConsentedPhotos(db: Firestore, storeId: string, limit = 60): Promise<ConsentedPhotoRow[]> {
  const snap = await col(db, storeId).orderBy("consentAtMs", "desc").limit(limit).get();
  const bucket = getAdminBucket();
  const expires = Date.now() + 60 * 60 * 1000;
  return Promise.all(
    snap.docs.map(async (d) => {
      const x = d.data();
      const [url] = await bucket
        .file(String(x.path))
        .getSignedUrl({ action: "read", expires, responseDisposition: `attachment; filename="shareat-${d.id}.jpg"` });
      return {
        id: d.id,
        tableDisplayName: String(x.tableDisplayName || ""),
        layout: String(x.layout || ""),
        consentAtMs: Number(x.consentAtMs || 0),
        url,
      };
    })
  );
}

/**
 * Remove a photo (consent withdrawn, or not fit to post). The path scopes it to one store.
 * With `ownerKey`, only the diner who gave consent may remove it: everyone at a table
 * shares the session id, so the id alone is not enough (audit CUSTOMER-04). Staff
 * (manager / admin route) omit it.
 */
export async function deleteConsentedPhoto(
  db: Firestore,
  storeId: string,
  id: string,
  ownerKey?: string
): Promise<"deleted" | "missing" | "not-owner"> {
  const ref = col(db, storeId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return "missing";
  if (ownerKey !== undefined && snap.data()?.identityKey !== ownerKey) return "not-owner";
  await getAdminBucket().file(String(snap.data()?.path)).delete({ ignoreNotFound: true });
  await ref.delete();
  return "deleted";
}

/* ─── Thermal print requests (POS "Photo prints" tab reads these) ─────────── */

/**
 * The contract with POS (`stores/{storeId}/photoPrintRequests/{id}`), read by
 * POS/src/components/pins/photo-prints.tsx. POS staff may read and update these
 * through its store catch-all rule; only this route creates them.
 *
 *   status: "queued" | "printed" | "declined"
 *   dayKey: Manila "YYYY-MM-DD" — POS lists one day at a time by it
 *   imageUrl: signed read link to the JPEG, valid PRINT_URL_DAYS
 *   printCount / reprintCount: set by POS when the cashier prints
 *
 * Fees are not added to the bill (owner, 2026-11-21): POS only counts prints,
 * the first per table session being the free one.
 */
export const PRINT_COLLECTION = "photoPrintRequests";
const PRINT_URL_DAYS = 7;
/** Per table session, so a stuck button or a prankster cannot flood the cashier's queue. */
export const MAX_PRINT_REQUESTS_PER_SESSION = 6;

export type PrintRequestInput = {
  storeId: string;
  sessionId: string;
  identityKey: string;
  tableDisplayName: string;
  customerName: string;
  photoId: string;
  layout: string;
  dayKey: string;
  bytes: Uint8Array;
};

export async function savePrintRequest(
  db: Firestore,
  p: PrintRequestInput
): Promise<{ ok: true; id: string; already: boolean } | { ok: false; error: string; status: number }> {
  const id = `${p.sessionId}_${p.photoId}`;
  const col = db.collection(`stores/${p.storeId}/${PRINT_COLLECTION}`);
  const ref = col.doc(id);
  if ((await ref.get()).exists) return { ok: true, id, already: true };

  const used = (await col.where("sessionId", "==", p.sessionId).count().get()).data().count;
  if (used >= MAX_PRINT_REQUESTS_PER_SESSION) {
    return { ok: false, status: 429, error: "This table has sent the most print requests allowed. Ask the cashier for help." };
  }

  const path = `captureSharePrints/${p.storeId}/${id}.jpg`;
  const file = getAdminBucket().file(path);
  await file.save(Buffer.from(p.bytes), { contentType: "image/jpeg", resumable: false });
  const [imageUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + PRINT_URL_DAYS * 24 * 60 * 60 * 1000 });

  try {
    await ref.create({
      status: "queued",
      storeId: p.storeId,
      sessionId: p.sessionId,
      identityKey: p.identityKey,
      tableDisplayName: p.tableDisplayName,
      customerName: p.customerName,
      layout: p.layout.slice(0, 20),
      path,
      imageUrl,
      dayKey: p.dayKey,
      printCount: 0,
      reprintCount: 0,
      createdAtMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    if ((e as { code?: number })?.code !== 6) {
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      throw e;
    }
  }
  return { ok: true, id, already: false };
}

/** The branch's thermal paper, from POS receipt settings. Unknown means the common 80mm. */
export async function readPaperWidth(db: Firestore, storeId: string): Promise<"58mm" | "80mm"> {
  const snap = await db.doc(`stores/${storeId}/receiptSettings/main`).get();
  return snap.data()?.paperWidth === "58mm" ? "58mm" : "80mm";
}
