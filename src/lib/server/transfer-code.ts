import { randomInt } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

/**
 * Receive codes (audit PRV-01).
 *
 * To send points, the sender types a short code the recipient's own app showed
 * them — never a phone number. A phone number can be tried against any account
 * to learn whether it has a card; a code can only be known by being shown it.
 *
 * Stored at `transferCodes/{code}` (server-only). `expiresAt` is a Timestamp
 * alongside `expiresAtMs` so a Firestore TTL policy on `transferCodes.expiresAt`
 * can sweep leftovers; a code is dead from `expiresAtMs` regardless.
 */

/** No 0/O, 1/I/L: a code read aloud across a table must not be misheard. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60 * 1000;

/** One answer for every kind of miss, so a miss says nothing about any phone or card. */
export const BAD_CODE = "That code is not valid or has expired. Ask your friend for a new one.";

export function generateTransferCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** What a person typed -> the stored code, or null if it cannot be one. */
export function normalizeTransferCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== CODE_LENGTH) return null;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null;
  return c;
}

/** "ABCDEF" -> "ABC-DEF". */
export function formatTransferCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function transferCodeRef(db: Firestore, code: string) {
  return db.doc(`transferCodes/${code}`);
}

const ALREADY_EXISTS = 6;

export async function issueTransferCode(
  db: Firestore,
  phone: string,
  nowMs: number = Date.now()
): Promise<{ code: string; expiresAtMs: number }> {
  const expiresAtMs = nowMs + CODE_TTL_MS;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateTransferCode();
    try {
      // create() fails if the code exists, so a live code is never taken over.
      await transferCodeRef(db, code).create({
        phone,
        createdAtMs: nowMs,
        expiresAtMs,
        expiresAt: Timestamp.fromMillis(expiresAtMs),
      });
      return { code, expiresAtMs };
    } catch (e: any) {
      if (e?.code !== ALREADY_EXISTS) throw e;
    }
  }
  throw new Error("Could not issue a code. Try again.");
}

/** Whose code is this, if it is live right now. Does not use it up. */
export async function peekTransferCode(db: Firestore, code: string, nowMs: number = Date.now()): Promise<string | null> {
  const snap = await transferCodeRef(db, code).get();
  if (!snap.exists) return null;
  const d = snap.data() as any;
  if (!d?.phone || !(Number(d.expiresAtMs) > nowMs)) return null;
  return String(d.phone);
}
