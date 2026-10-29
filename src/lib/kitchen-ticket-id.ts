import { createHash } from "node:crypto";

/**
 * Deterministic kitchen-ticket ids for retry-safe customer orders.
 *
 * An order is written one ticket per line, each in its own transaction (a line
 * fans out to its station's KDS doc, and one order can span several stations).
 * If line 3 fails after lines 1-2 committed, a retry used to write 1-2 again —
 * and add-ons are charged on serve, so the diner paid twice.
 *
 * With an id that is a pure function of (who, which submission, which line), a
 * retry lands on the same doc ids: lines that already exist are skipped, the
 * missing ones are written, and the response carries the full list either way.
 */

/**
 * The client's per-submission id, or null when absent or malformed.
 *
 * Null means "no idempotency" — the caller falls back to random ticket ids,
 * which is exactly how requests from clients that predate this behaved.
 * Bounded and restricted so it cannot be used to bloat anything it is folded
 * into; crypto.randomUUID() output fits.
 */
export function normalizeRequestId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length < 8 || s.length > 128) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}

export type KitchenTicketIdParts = {
  /** Keeps a refill and an add-on submission from ever sharing an id space. */
  kind: "refill" | "addon";
  storeId: string;
  sessionId: string;
  participantId: string;
  requestId: string;
  lineIndex: number;
  /**
   * What the line orders (item, qty, ...). Not needed for uniqueness — the
   * index already is — but if a client ever reuses one request id for a
   * different basket, a changed line gets a fresh id rather than being
   * silently "skipped" as already sent.
   */
  lineKey: string;
};

export function deriveKitchenTicketId(parts: KitchenTicketIdParts): string {
  // JSON array, not string concatenation: no choice of field values can make
  // two different tuples serialise the same.
  const material = JSON.stringify([
    "kitchen-ticket/v1",
    parts.kind,
    parts.storeId,
    parts.sessionId,
    parts.participantId,
    parts.requestId,
    parts.lineIndex,
    parts.lineKey,
  ]);
  // 128 bits of hex: collision-free in practice, and a legal Firestore doc id.
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}
