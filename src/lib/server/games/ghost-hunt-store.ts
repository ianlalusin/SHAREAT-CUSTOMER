import { FieldValue, type Firestore } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import {
  CATCH_GRACE_MS,
  MAX_PIN_FAILS,
  MIN_SCAN_GAP_MS,
  PRIZE_GHOST_TTL_MS,
  dayProgress,
  eventState,
  genClaimCode,
  manilaDayKey,
  normalizeSettings,
  rollSpawn,
  type GhostHuntSettings,
  type SpawnKind,
} from "@/lib/games/ghost-hunt/rules";
import { isGameConfigured, isGameEnabledForStore } from "@/lib/games/gameScope";
import type { PlayerContext } from "@/lib/server/games/auth";

/**
 * Ghost Hunt persistence. Admin SDK only — the diner never writes Firestore
 * directly, so every rule below is enforced here and nowhere else.
 *
 *   miniGames/ghost-hunt             on/off, run dates, and `event` settings
 *   ghostHuntDays/{store}_{day}      prizes given out per branch per Manila day
 *   ghostHuntTables/{store}_{sess}   which catch this table won (one per visit)
 *   ghostHuntScans/{store}_{player}  last scan time, for the scan rate limit
 *   ghostHuntCatches/{id}            one prize ghost: spawned → won → claimed
 *   ghostHuntBranches/{store}        the branch's cashier PIN (bcrypt hash)
 */

export const GAME_ID = "ghost-hunt";

export type CatchStatus = "spawned" | "won" | "claimed";

export type CatchDoc = {
  id: string;
  status: CatchStatus;
  storeId: string;
  storeName: string;
  sessionId: string;
  tableDisplayName: string;
  identityKey: string;
  day: string;
  prizeId: string;
  prizeName: string;
  spawnedAtMs: number;
  expiresAtMs: number;
  code: string | null;
  wonAtMs: number | null;
  claimedAtMs: number | null;
  claimedBy: "cashier-pin" | "manager" | null;
  claimedByUid: string | null;
  pinFails: number;
};

/** What a diner's phone may know about their prize. */
export type PublicTicket = {
  catchId: string;
  status: "won" | "claimed";
  prizeId: string;
  prizeName: string;
  code: string;
  storeName: string;
  tableDisplayName: string;
  day: string;
  wonAtMs: number;
  claimedAtMs: number | null;
  locked: boolean;
};

export function toTicket(c: CatchDoc): PublicTicket {
  return {
    catchId: c.id,
    status: c.status === "claimed" ? "claimed" : "won",
    prizeId: c.prizeId,
    prizeName: c.prizeName,
    code: c.code || "",
    storeName: c.storeName,
    tableDisplayName: c.tableDisplayName,
    day: c.day,
    wonAtMs: c.wonAtMs || 0,
    claimedAtMs: c.claimedAtMs,
    locked: (c.pinFails || 0) >= MAX_PIN_FAILS,
  };
}

export type GhostHuntConfig = {
  configured: boolean;
  /** The raw doc's scope fields, for the per-branch switch. */
  scope: Record<string, any> | null;
  settings: GhostHuntSettings;
};

export async function readGhostHuntConfig(db: Firestore): Promise<GhostHuntConfig> {
  const snap = await db.doc(`miniGames/${GAME_ID}`).get();
  const data = snap.exists ? (snap.data() as Record<string, any>) : null;
  return { configured: isGameConfigured(data), scope: data, settings: normalizeSettings(data?.event) };
}

export type HuntStatus =
  | { live: true; settings: GhostHuntSettings }
  | { live: false; message: string; settings: GhostHuntSettings };

/** Whether the hunt is running for this diner right now, and if not, why — in their words. */
export function huntStatus(cfg: GhostHuntConfig, storeId: string | null, nowMs: number): HuntStatus {
  const { settings } = cfg;
  if (!cfg.configured || cfg.scope?.isActive === false) {
    return { live: false, message: "The ghost hunt is not running right now.", settings };
  }
  if (storeId && !isGameEnabledForStore(cfg.scope, storeId, nowMs)) {
    return { live: false, message: "The ghost hunt is not running at this branch.", settings };
  }
  const ev = eventState(settings, nowMs);
  return ev.live ? { live: true, settings } : { live: false, message: ev.message, settings };
}

const dayRef = (db: Firestore, storeId: string, day: string) => db.doc(`ghostHuntDays/${storeId}_${day}`);
const tableRef = (db: Firestore, storeId: string, sessionId: string) =>
  db.doc(`ghostHuntTables/${storeId}_${sessionId}`);

export type ScanResult =
  | { ok: true; kind: SpawnKind; spawnId?: string; prizeId?: string; prizeName?: string; ttlMs?: number; retryInMs: number }
  | { ok: false; status: number; error: string };

/**
 * One look around the room.
 *
 * The rate limit is per diner, written in the same transaction that reads it,
 * so two tabs on one phone cannot double the odds. A prize ghost is only a
 * CHANCE to win: it becomes a prize when caught in time, and stock is checked
 * again at that moment — nothing is held for a ghost nobody catches.
 */
export async function scanForGhost(
  db: Firestore,
  player: PlayerContext,
  nowMs: number,
  rand: () => number = Math.random
): Promise<ScanResult> {
  const cfg = await readGhostHuntConfig(db);
  const status = huntStatus(cfg, player.storeId, nowMs);
  if (!status.live) return { ok: false, status: 409, error: status.message };
  const settings = status.settings;

  const day = manilaDayKey(nowMs);
  const scanRef = db.doc(`ghostHuntScans/${player.storeId}_${player.identityKey}`);
  const catchRef = db.collection("ghostHuntCatches").doc();

  return db.runTransaction(async (tx) => {
    const [scanSnap, daySnap, tableSnap] = await Promise.all([
      tx.get(scanRef),
      tx.get(dayRef(db, player.storeId, day)),
      tx.get(tableRef(db, player.storeId, player.sessionId)),
    ]);

    const last = Number(scanSnap.data()?.lastScanMs) || 0;
    if (nowMs - last < MIN_SCAN_GAP_MS) {
      return { ok: true as const, kind: "none" as const, retryInMs: MIN_SCAN_GAP_MS - (nowMs - last) };
    }
    tx.set(scanRef, { lastScanMs: nowMs, storeId: player.storeId }, { merge: true });

    const issued = (daySnap.data()?.issued || {}) as Record<string, number>;
    const tableHasWon = !!tableSnap.data()?.wonCatchId;
    const roll = rollSpawn({ settings, issued, tableHasWon, rand, progress: dayProgress(settings.windows, nowMs) });

    if (roll.kind !== "prize" || !roll.prize) {
      return { ok: true as const, kind: roll.kind, retryInMs: MIN_SCAN_GAP_MS };
    }

    const doc: CatchDoc = {
      id: catchRef.id,
      status: "spawned",
      storeId: player.storeId,
      storeName: player.storeName,
      sessionId: player.sessionId,
      tableDisplayName: player.tableDisplayName,
      identityKey: player.identityKey,
      day,
      prizeId: roll.prize.id,
      prizeName: roll.prize.name,
      spawnedAtMs: nowMs,
      expiresAtMs: nowMs + PRIZE_GHOST_TTL_MS,
      code: null,
      wonAtMs: null,
      claimedAtMs: null,
      claimedBy: null,
      claimedByUid: null,
      pinFails: 0,
    };
    tx.set(catchRef, doc);

    return {
      ok: true as const,
      kind: "prize" as const,
      spawnId: catchRef.id,
      prizeId: roll.prize.id,
      prizeName: roll.prize.name,
      ttlMs: PRIZE_GHOST_TTL_MS,
      retryInMs: PRIZE_GHOST_TTL_MS,
    };
  });
}

export type CatchResult = { ok: true; ticket: PublicTicket } | { ok: false; status: number; error: string };

/** The diner tapped the prize ghost. Turn it into a prize, if it is still theirs to win. */
export async function catchGhost(
  db: Firestore,
  player: PlayerContext,
  spawnId: string,
  nowMs: number
): Promise<CatchResult> {
  const cfg = await readGhostHuntConfig(db);
  const settings = cfg.settings;
  const catchRef = db.doc(`ghostHuntCatches/${spawnId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(catchRef);
    if (!snap.exists) return { ok: false as const, status: 404, error: "That ghost is gone." };
    const c = snap.data() as CatchDoc;

    if (c.identityKey !== player.identityKey || c.sessionId !== player.sessionId) {
      return { ok: false as const, status: 403, error: "That ghost was not yours to catch." };
    }
    if (c.status !== "spawned") return { ok: true as const, ticket: toTicket(c) };
    if (nowMs > c.expiresAtMs + CATCH_GRACE_MS) {
      return { ok: false as const, status: 410, error: "Too slow — it vanished!" };
    }

    const tRef = tableRef(db, c.storeId, c.sessionId);
    const dRef = dayRef(db, c.storeId, c.day);
    const [tableSnap, daySnap] = await Promise.all([tx.get(tRef), tx.get(dRef)]);

    if (tableSnap.data()?.wonCatchId) {
      return { ok: false as const, status: 409, error: "Your table already won a prize this visit." };
    }
    const prize = settings.prizes.find((p) => p.id === c.prizeId);
    const given = Number((daySnap.data()?.issued || {})[c.prizeId]) || 0;
    // Re-checked at the catch, not just the spawn: two diners can be chasing
    // the last one. Pacing is judged at spawn time — a ghost the diner already
    // found is theirs to catch, even if the clock has moved on.
    if (!prize || given >= prize.perDay) {
      return { ok: false as const, status: 409, error: "So close! Someone else caught the last one today." };
    }

    const won: CatchDoc = { ...c, status: "won", code: genClaimCode(), wonAtMs: nowMs };
    tx.set(catchRef, won);
    tx.set(dRef, { storeId: c.storeId, day: c.day, issued: { [c.prizeId]: FieldValue.increment(1) } }, { merge: true });
    tx.set(tRef, { wonCatchId: c.id, storeId: c.storeId, sessionId: c.sessionId, wonAtMs: nowMs });
    return { ok: true as const, ticket: toTicket(won) };
  });
}

/** This table's prize, so a refreshed phone gets its ticket back. */
export async function readTableTicket(db: Firestore, player: PlayerContext): Promise<PublicTicket | null> {
  const t = await tableRef(db, player.storeId, player.sessionId).get();
  const id = String(t.data()?.wonCatchId || "");
  if (!id) return null;
  const c = await db.doc(`ghostHuntCatches/${id}`).get();
  return c.exists ? toTicket(c.data() as CatchDoc) : null;
}

/** A ticket by id, for the claim screen — which may outlive the table session. */
export async function readTicket(db: Firestore, catchId: string): Promise<PublicTicket | null> {
  if (!/^[A-Za-z0-9]{10,40}$/.test(catchId)) return null;
  const c = await db.doc(`ghostHuntCatches/${catchId}`).get();
  if (!c.exists) return null;
  const d = c.data() as CatchDoc;
  return d.status === "spawned" ? null : toTicket(d);
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,6}$/.test(pin);
}

export async function setBranchPin(db: Firestore, storeId: string, pin: string, uid: string): Promise<void> {
  await db.doc(`ghostHuntBranches/${storeId}`).set(
    { pinHash: await bcrypt.hash(pin, 10), updatedAtMs: Date.now(), updatedByUid: uid },
    { merge: true }
  );
}

export async function branchHasPin(db: Firestore, storeId: string): Promise<boolean> {
  return !!(await db.doc(`ghostHuntBranches/${storeId}`).get()).data()?.pinHash;
}

export type ClaimResult = { ok: true; ticket: PublicTicket } | { ok: false; status: number; error: string };

/**
 * The cashier hands over the prize and types the branch PIN on the diner's
 * phone. A prize is good for the day it was won only, and a ticket locks after
 * a few wrong PINs so a diner cannot guess their way through.
 */
export async function claimWithPin(db: Firestore, catchId: string, pin: string, nowMs: number): Promise<ClaimResult> {
  if (!/^[A-Za-z0-9]{10,40}$/.test(catchId)) return { ok: false, status: 404, error: "Ticket not found." };
  const catchRef = db.doc(`ghostHuntCatches/${catchId}`);
  const pre = await catchRef.get();
  if (!pre.exists) return { ok: false, status: 404, error: "Ticket not found." };
  const storeId = (pre.data() as CatchDoc).storeId;
  const branch = await db.doc(`ghostHuntBranches/${storeId}`).get();
  const hash = String(branch.data()?.pinHash || "");
  if (!hash) return { ok: false, status: 409, error: "This branch has no cashier PIN yet. Ask the manager." };
  const pinOk = await bcrypt.compare(pin, hash);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(catchRef);
    const c = snap.data() as CatchDoc;
    if (c.status === "claimed") return { ok: false as const, status: 409, error: "This prize was already given." };
    if (c.status !== "won") return { ok: false as const, status: 404, error: "Ticket not found." };
    if ((c.pinFails || 0) >= MAX_PIN_FAILS) {
      return { ok: false as const, status: 423, error: "Too many wrong PINs. The manager can release it." };
    }
    if (c.day !== manilaDayKey(nowMs)) {
      return { ok: false as const, status: 410, error: "This prize was for another day and has expired." };
    }
    if (!pinOk) {
      tx.update(catchRef, { pinFails: FieldValue.increment(1) });
      return { ok: false as const, status: 403, error: "Wrong PIN." };
    }
    const claimed: CatchDoc = { ...c, status: "claimed", claimedAtMs: nowMs, claimedBy: "cashier-pin", claimedByUid: null };
    tx.set(catchRef, claimed);
    return { ok: true as const, ticket: toTicket(claimed) };
  });
}

/** The manager's view of one branch's day: who won what, and whether it was given. */
export async function listBranchDay(db: Firestore, storeId: string, day: string) {
  const [snap, daySnap] = await Promise.all([
    db.collection("ghostHuntCatches").where("storeId", "==", storeId).where("day", "==", day).get(),
    dayRef(db, storeId, day).get(),
  ]);
  const winners = snap.docs
    .map((d) => d.data() as CatchDoc)
    .filter((c) => c.status !== "spawned")
    .sort((a, b) => (b.wonAtMs || 0) - (a.wonAtMs || 0))
    .map((c) => ({ ...toTicket(c), pinFails: c.pinFails || 0, claimedBy: c.claimedBy }));
  return { winners, issued: (daySnap.data()?.issued || {}) as Record<string, number> };
}

/** Manager marks a prize given (or releases a locked ticket) from their own screen. */
export async function managerClaim(db: Firestore, storeId: string, catchId: string, uid: string, nowMs: number) {
  const ref = db.doc(`ghostHuntCatches/${catchId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, status: 404, error: "Ticket not found." };
    const c = snap.data() as CatchDoc;
    if (c.storeId !== storeId) return { ok: false as const, status: 403, error: "Not this branch's ticket." };
    if (c.status === "claimed") return { ok: false as const, status: 409, error: "Already given." };
    if (c.status !== "won") return { ok: false as const, status: 404, error: "Ticket not found." };
    tx.update(ref, { status: "claimed", claimedAtMs: nowMs, claimedBy: "manager", claimedByUid: uid });
    return { ok: true as const };
  });
}
