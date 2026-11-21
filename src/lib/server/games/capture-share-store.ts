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
  return null;
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
  await getAdminBucket().file(path).save(Buffer.from(p.bytes), { contentType: "image/jpeg", resumable: false });

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
    if ((e as { code?: number })?.code !== 6) throw e;
  }
  return { ok: true };
}

export type ConsentedPhotoRow = {
  id: string;
  tableDisplayName: string;
  layout: string;
  consentAtMs: number;
  url: string;
  downloadUrl: string;
};

/** One branch's consented photos, newest first, with short-lived signed links. */
export async function listConsentedPhotos(db: Firestore, storeId: string, limit = 60): Promise<ConsentedPhotoRow[]> {
  const snap = await col(db, storeId).orderBy("consentAtMs", "desc").limit(limit).get();
  const bucket = getAdminBucket();
  const expires = Date.now() + 60 * 60 * 1000;
  return Promise.all(
    snap.docs.map(async (d) => {
      const x = d.data();
      const file = bucket.file(String(x.path));
      const [[url], [downloadUrl]] = await Promise.all([
        file.getSignedUrl({ action: "read", expires }),
        file.getSignedUrl({ action: "read", expires, responseDisposition: `attachment; filename="shareat-${d.id}.jpg"` }),
      ]);
      return {
        id: d.id,
        tableDisplayName: String(x.tableDisplayName || ""),
        layout: String(x.layout || ""),
        consentAtMs: Number(x.consentAtMs || 0),
        url,
        downloadUrl,
      };
    })
  );
}

/** Remove a photo (consent withdrawn, or not fit to post). The path scopes it to one store. */
export async function deleteConsentedPhoto(db: Firestore, storeId: string, id: string): Promise<boolean> {
  const ref = col(db, storeId).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await getAdminBucket().file(String(snap.data()?.path)).delete({ ignoreNotFound: true });
  await ref.delete();
  return true;
}
