import { createHash } from "node:crypto";
import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";
import { RETENTION_YEARS_AFTER_LAST_VISIT } from "@/lib/privacy";
import { manilaDayId, maskPhone, redactEntries, retentionCutoffMs, retentionDecision, toMillis } from "@/lib/retention";

/**
 * The privacy notice's deletion promise, carried out.
 *
 * DRY RUN BY DEFAULT: a run only reports what it would delete unless the
 * caller passes `dryRun: false` explicitly — the admin route additionally
 * demands a typed confirmation. A real run deletes at most `maxDeletes` cards,
 * so one mistake can never sweep the whole customer list.
 *
 * Per card, in this order, so a crash part-way leaves the card itself in place
 * and the next run simply finishes the job:
 *   1. loyaltyLogs about this phone → phone and name blanked (the log stays,
 *      so audit counts still add up), and the same in the daily projection;
 *   2. loyaltyRedemptions for this phone → phone blanked (vouchers are part of
 *      a receipt's discount, so the record stays);
 *   3. stats: one account fewer, its leftover points no longer outstanding;
 *   4. a tombstone keyed by a hash of the phone — proof of deletion that holds
 *      no personal data;
 *   5. the card doc with everything under it (points history, transfer
 *      counters) — last.
 *
 * NOT touched: POS receipts and sessions (sales records, kept as tax law
 * requires) and other members' points history, which may still name this
 * person as a transfer sender or recipient (finding those needs a
 * collection-group index; see the PR notes).
 */

const PAGE = 300;
export const MAX_DELETES_PER_RUN = 200;

export type RetentionReport = {
  dryRun: boolean;
  cutoffDate: string;
  scanned: number;
  kept: number;
  skippedVoucherHeld: number;
  skippedNoDate: number;
  /** Cards past the cutoff (all of them, not only this run's batch). */
  due: number;
  /** Cards actually deleted this run (0 on a dry run). */
  deleted: number;
  pointsForfeited: number;
  /** Up to 20 of the due cards, phones masked. */
  sample: { phone: string; lastActivity: string; points: number }[];
  /** True when more cards are due than this run was allowed to delete. */
  moreRemain: boolean;
};

type Due = { phone: string; lastActivityMs: number; points: number };

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function runRetention(
  db: Firestore,
  opts: { dryRun?: boolean; maxDeletes?: number; nowMs?: number; uid?: string } = {}
): Promise<RetentionReport> {
  const dryRun = opts.dryRun !== false;
  const maxDeletes = Math.max(0, Math.min(MAX_DELETES_PER_RUN, Math.floor(opts.maxDeletes ?? MAX_DELETES_PER_RUN)));
  const nowMs = opts.nowMs ?? Date.now();
  const years = RETENTION_YEARS_AFTER_LAST_VISIT;

  const report: RetentionReport = {
    dryRun,
    cutoffDate: isoDay(retentionCutoffMs(nowMs, years)),
    scanned: 0,
    kept: 0,
    skippedVoucherHeld: 0,
    skippedNoDate: 0,
    due: 0,
    deleted: 0,
    pointsForfeited: 0,
    sample: [],
    moreRemain: false,
  };

  // Scan every card in id order, a page at a time.
  const due: Due[] = [];
  let after: string | null = null;
  for (;;) {
    let q = db.collection("customers").orderBy(FieldPath.documentId()).limit(PAGE);
    if (after) q = q.startAfter(after);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      report.scanned++;
      const data = d.data() as Record<string, any>;
      const decision = retentionDecision(data, nowMs, years);
      if (decision.action === "keep") report.kept++;
      else if (decision.action === "skip") {
        if (decision.reason === "voucher-held") report.skippedVoucherHeld++;
        else report.skippedNoDate++;
      } else {
        due.push({ phone: d.id, lastActivityMs: decision.lastActivityMs, points: Math.max(0, Number(data.pointsBalance || 0)) });
      }
    }
    after = snap.docs[snap.docs.length - 1].id;
    if (snap.size < PAGE) break;
  }

  report.due = due.length;
  report.sample = due.slice(0, 20).map((c) => ({
    phone: maskPhone(c.phone),
    lastActivity: isoDay(c.lastActivityMs),
    points: c.points,
  }));
  const batch = due.slice(0, maxDeletes);
  report.moreRemain = due.length > batch.length;

  if (dryRun) {
    report.pointsForfeited = due.reduce((a, c) => a + c.points, 0);
  } else {
    for (const c of batch) {
      const done = await deleteCard(db, c.phone, nowMs, years);
      if (done) {
        report.deleted++;
        report.pointsForfeited += done.points;
      }
    }
  }

  // Run record: counts only, no phones.
  await db.collection("retentionRuns").add({
    ...report,
    sample: report.sample.length,
    ranAtMs: nowMs,
    ranByUid: opts.uid ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });

  return report;
}

/**
 * Delete one card. Re-reads it first and re-applies the rule, so a card that
 * came back to life between the scan and now (a visit a minute ago) is left
 * alone. Returns null when it was not deleted.
 */
async function deleteCard(db: Firestore, phone: string, nowMs: number, years: number): Promise<{ points: number } | null> {
  const ref = db.doc(`customers/${phone}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, any>;
  const decision = retentionDecision(data, nowMs, years);
  if (decision.action !== "delete") return null;
  return eraseCard(db, phone, nowMs, {
    reason: `no activity for ${years} years`,
    lastActivityDate: isoDay(decision.lastActivityMs),
  });
}

/**
 * Erase one card and the person from everything that points at it: the steps
 * in the header comment, in that order. It does NOT decide whether the card
 * may go. Two callers do that first: the two-year job (inactivity) and the
 * cardholder's own delete (password + typed confirmation).
 */
export async function eraseCard(
  db: Firestore,
  phone: string,
  nowMs: number,
  why: { reason: string; lastActivityDate?: string }
): Promise<{ points: number }> {
  const ref = db.doc(`customers/${phone}`);
  const snap = await ref.get();
  const data = (snap.exists ? snap.data() : {}) as Record<string, any>;
  const points = Math.max(0, Number(data.pointsBalance || 0));

  // 1. Logs about this person, and the daily projection days they appear on.
  const logs = await db.collection("loyaltyLogs").where("phone", "==", phone).get();
  const days = new Set<string>();
  for (let i = 0; i < logs.docs.length; i += 400) {
    const b = db.batch();
    for (const d of logs.docs.slice(i, i + 400)) {
      const ms = toMillis(d.get("createdAt"));
      if (ms) days.add(manilaDayId(ms));
      b.update(d.ref, { phone: null, customerName: "", redacted: true });
    }
    await b.commit();
  }
  for (const day of days) await redactDay(db, day, phone);

  // 2. Vouchers: keep the record (it may be on a receipt), drop who it was.
  const vouchers = await db.collection("loyaltyRedemptions").where("phone", "==", phone).get();
  for (let i = 0; i < vouchers.docs.length; i += 400) {
    const b = db.batch();
    for (const d of vouchers.docs.slice(i, i + 400)) {
      b.update(d.ref, { phone: null, customerName: FieldValue.delete(), redacted: true });
    }
    await b.commit();
  }

  // 3 + 4. Stats and tombstone together.
  const tombstone = db.doc(`retentionDeletions/${createHash("sha256").update(phone).digest("hex")}`);
  const stats = db.batch();
  stats.set(
    db.doc("loyaltyStats/global"),
    {
      totalAccounts: FieldValue.increment(-1),
      ...(points ? { totalPointsOutstanding: FieldValue.increment(-points) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  stats.set(tombstone, {
    deletedAtMs: nowMs,
    ...(why.lastActivityDate ? { lastActivityDate: why.lastActivityDate } : {}),
    pointsForfeited: points,
    reason: why.reason,
  });
  await stats.commit();

  // 5. The card and everything under it, last.
  await db.recursiveDelete(ref);
  return { points };
}

/** Blank this phone out of every part of one day's log projection. */
async function redactDay(db: Firestore, dayId: string, phone: string) {
  const meta = await db.doc(`loyaltyLogsDaily/${dayId}_meta`).get();
  const parts = Math.max(1, Number(meta.data()?.partCount || 1));
  for (let p = 0; p < parts; p++) {
    const ref = db.doc(`loyaltyLogsDaily/${dayId}_${p}`);
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return;
      const next = redactEntries(Array.isArray(s.data()?.entries) ? s.data()!.entries : [], phone);
      if (next) tx.update(ref, { entries: next, updatedAt: FieldValue.serverTimestamp() });
    });
  }
}
