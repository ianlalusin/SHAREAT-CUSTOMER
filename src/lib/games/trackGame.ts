"use client";

import { getAuth } from "firebase/auth";

import { getOrCreateDeviceId } from "@/lib/device-id";
import { getGameMetrics } from "@/lib/games/registry";
import { isVisitFresh, reachedThreshold, type GameMetric } from "@/lib/games/metrics";

/**
 * Tell the server a game was viewed or used. Fire-and-forget by design.
 *
 * A counter must never block, slow, or break the game it measures, so every
 * failure here is swallowed: a lost count is a worse metric, a thrown error is
 * a broken game.
 *
 * EVERY event is sent, not just the first. The server keeps two tallies — one
 * deduplicated per phone per session, one raw — and it cannot count the raw one
 * for events the client decided to swallow. What the client DOES own is the
 * threshold: five flips are one use, and nothing but this file knows that.
 *
 * What a view and a use mean per game lives in `lib/games/registry.ts`.
 */

const VISIT_KEY = "shareat_play_visit";

/** Signals seen this page-life, per game. Not persisted: a reload restarts the
 *  round it was counting, so the count should restart with it. */
const signals = new Map<string, number>();

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The "session" half of the dedup key for a caller with no table.
 *
 * localStorage with a rolling window, NOT sessionStorage: sessionStorage dies
 * with the tab, and a diner who plays while waiting, pockets the phone, and
 * reopens is exactly the walk-up player this metric exists to measure — they
 * would be counted twice.
 */
function rollingVisitId(): string {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string; startedAtMs?: number };
      if (parsed?.id && isVisitFresh(Number(parsed.startedAtMs), Date.now())) return parsed.id;
    }
  } catch {
    /* private mode, or junk in storage — fall through and issue a new one */
  }

  const id = newId();
  try {
    localStorage.setItem(VISIT_KEY, JSON.stringify({ id, startedAtMs: Date.now() }));
  } catch {
    // Storage blocked: every event becomes its own visit. That over-counts
    // reach for this one phone, which is the safe way round — it can never
    // collapse two real people into one.
  }
  return id;
}

/**
 * The live table session when there is one, a rolling id otherwise.
 *
 * ONE path, deliberately: `resolveGameCaller` never throws and silently demotes
 * a bad token to `anonymous`, so a design that keyed players off the token and
 * everyone else off a client id would fragment a single sitting across two
 * identities on any token hiccup, and count that phone twice.
 */
async function currentVisitId(): Promise<string> {
  try {
    const user = getAuth().currentUser;
    if (user) {
      const claims = (await user.getIdTokenResult()).claims as Record<string, unknown>;
      const sessionId = String(claims.sessionId || "");
      if (sessionId) return sessionId;
    }
  } catch {
    /* no auth, or the token would not resolve — use the rolling id */
  }
  return rollingVisitId();
}

async function send(gameId: string, metric: GameMetric): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const user = getAuth().currentUser;
    // Without this header the caller is anonymous, the server has no store to
    // attribute the count to, and the per-branch breakdown stays empty forever.
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  } catch {
    /* browse on without attribution */
  }

  const body = JSON.stringify({
    gameId,
    metric,
    visitId: await currentVisitId(),
    deviceId: getOrCreateDeviceId(),
  });

  // keepalive so the count survives the player immediately navigating away
  await fetch("/api/customer/games/metric", { method: "POST", headers, body, keepalive: true });
}

function fire(gameId: string, metric: GameMetric): void {
  try {
    void send(gameId, metric).catch(() => {});
  } catch {
    /* never surface */
  }
}

/** The game was opened, or its content was. See the registry for which. */
export function markView(gameId: string): void {
  fire(gameId, "view");
}

/**
 * One raw signal — a rating, a flip. Fires a `use` only once the game's
 * threshold is met, then starts counting the next one, so a second round counts
 * as a second use in the raw tally.
 */
export function signalUse(gameId: string): void {
  const threshold = getGameMetrics(gameId)?.use.threshold ?? 1;
  const next = (signals.get(gameId) || 0) + 1;

  if (reachedThreshold(next, threshold)) {
    signals.set(gameId, 0);
    fire(gameId, "use");
    return;
  }
  signals.set(gameId, next);
}

/** Tests and a game restarting mid-round. */
export function resetSignals(gameId?: string): void {
  if (gameId) signals.delete(gameId);
  else signals.clear();
}
