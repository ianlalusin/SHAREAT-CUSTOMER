import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

/**
 * Persistent fixed-window abuse limits for the public auth / PIN endpoints.
 *
 * In-memory counters would reset on every deploy and cold start and would not
 * be shared between instances, so the counters live in Firestore:
 * `rateLimits/{sha256(bucket:key)}`. The key is hashed so the collection never
 * holds raw phone numbers or table PINs.
 *
 * Every Firestore call here fails OPEN: if the counter store itself errors we
 * log and let the request through. A Firestore hiccup must not lock every diner
 * out of their table — the limits are a brake on automation, not a gate.
 *
 * `expiresAt` (a Timestamp) is written alongside `expiresAtMs` because a
 * Firestore TTL policy only works on Timestamp fields; point a TTL policy at
 * `rateLimits.expiresAt` so stale windows clean themselves up.
 */

export type RateRule = { bucket: string; limit: number; windowMs: number };

const MIN = 60_000;

/**
 * One place to tune the budgets. Buckets are shared across routes on purpose:
 * standalone login and in-session login draw from the same phone budget, so an
 * attacker cannot double their guesses by alternating endpoints.
 */
export const RATE_RULES = {
  /** Failed logins per target phone. */
  loginPhone: { bucket: "login-phone", limit: 10, windowMs: 15 * MIN },
  /** Failed logins per caller IP, across all phones. */
  loginIp: { bucket: "login-ip", limit: 30, windowMs: 15 * MIN },
  /** WRONG PINs per caller IP. Failures only: a whole restaurant joins from one WiFi address. */
  pinIp: { bucket: "pin-ip", limit: 40, windowMs: 10 * MIN },
  /**
   * Wrong attempts at one PIN value from anywhere — stops a botnet spreading
   * guesses of one code across many IPs. Above a full table's worth of joins
   * and rejoins so a real table never trips it.
   */
  pinValue: { bucket: "pin-value", limit: 30, windowMs: 10 * MIN },
  /** Account creations per caller IP. Generous: diners sign up at the table on the shared store WiFi. */
  signupIp: { bucket: "signup-ip", limit: 40, windowMs: 60 * MIN },
  /** Recipient lookups per signed-in account (phone enumeration brake). */
  lookupCaller: { bucket: "lookup-caller", limit: 20, windowMs: 60 * MIN },
  /** WRONG receive codes per signed-in account. Failures only: a right code costs nothing. */
  codeGuess: { bucket: "code-guess", limit: 10, windowMs: 15 * MIN },
  /**
   * Signups answered "this phone already has a card", per caller IP. That answer
   * is true and a signup must give it, so it is budgeted instead: failures only,
   * a new number costs nothing (audit PRV-01). Above what a table of diners who
   * forgot they had a card would use on the shared store WiFi.
   */
  signupTaken: { bucket: "signup-taken", limit: 10, windowMs: 60 * MIN },
  /** Receive codes a card may ask for per hour. */
  receiveCode: { bucket: "receive-code", limit: 10, windowMs: 60 * MIN },
} satisfies Record<string, RateRule>;

export type WindowState = { count: number; windowStartMs: number };

/** How long until this window lets another request through; 0 = allowed now. */
export function retryAfterMs(state: WindowState | null | undefined, rule: RateRule, nowMs: number): number {
  if (!state) return 0;
  const endMs = state.windowStartMs + rule.windowMs;
  if (nowMs >= endMs) return 0;
  return state.count >= rule.limit ? endMs - nowMs : 0;
}

/**
 * Count one hit. A blocked hit is not counted — the window is already full, and
 * not writing keeps a flood of refused requests from becoming a flood of writes.
 */
export function applyHit(
  state: WindowState | null | undefined,
  rule: RateRule,
  nowMs: number
): { allowed: boolean; retryAfterMs: number; next: WindowState | null } {
  const wait = retryAfterMs(state, rule, nowMs);
  if (wait > 0) return { allowed: false, retryAfterMs: wait, next: null };
  const live = !!state && nowMs < state.windowStartMs + rule.windowMs;
  const next = live ? { count: state!.count + 1, windowStartMs: state!.windowStartMs } : { count: 1, windowStartMs: nowMs };
  return { allowed: true, retryAfterMs: 0, next };
}

/** Caller IP: first x-forwarded-for hop, the client as the proxy saw it. */
export function clientIp(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim();
  return first || "unknown";
}

export type RateHit = [rule: RateRule, key: string];
export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

function docFor(db: Firestore, rule: RateRule, key: string) {
  const id = createHash("sha256").update(`${rule.bucket}:${key}`).digest("hex");
  return db.doc(`rateLimits/${id}`);
}

function readState(snap: any): WindowState | null {
  if (!snap?.exists) return null;
  const d = snap.data() || {};
  return { count: Number(d.count || 0), windowStartMs: Number(d.windowStartMs || 0) };
}

function stateDoc(rule: RateRule, s: WindowState) {
  const expiresAtMs = s.windowStartMs + rule.windowMs;
  return { bucket: rule.bucket, count: s.count, windowStartMs: s.windowStartMs, expiresAtMs, expiresAt: Timestamp.fromMillis(expiresAtMs) };
}

/**
 * Attempt budget: counts this request against every hit, refusing (and counting
 * nothing) if any window is already full. One transaction, so concurrent
 * requests cannot all read the same count and slip past the limit together.
 */
export async function consumeRateLimits(db: Firestore, hits: RateHit[]): Promise<RateLimitResult> {
  try {
    const nowMs = Date.now();
    return await db.runTransaction(async (tx) => {
      const refs = hits.map(([rule, key]) => docFor(db, rule, key));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      const results = hits.map(([rule], i) => applyHit(readState(snaps[i]), rule, nowMs));
      const wait = Math.max(0, ...results.map((r) => r.retryAfterMs));
      if (wait > 0) return { ok: false as const, retryAfterMs: wait };
      results.forEach((r, i) => tx.set(refs[i], stateDoc(hits[i][0], r.next!)));
      return { ok: true as const };
    });
  } catch (e) {
    console.error("[rate-limit] store error on consume; failing open", e);
    return { ok: true };
  }
}

/**
 * Failure budget, part 1: is any window already full? Read-only, so a correct
 * password never costs a write. Pair with recordRateLimitFailures().
 */
export async function checkRateLimits(db: Firestore, hits: RateHit[]): Promise<RateLimitResult> {
  try {
    const nowMs = Date.now();
    const snaps = await Promise.all(hits.map(([rule, key]) => docFor(db, rule, key).get()));
    const wait = Math.max(0, ...hits.map(([rule], i) => retryAfterMs(readState(snaps[i]), rule, nowMs)));
    return wait > 0 ? { ok: false, retryAfterMs: wait } : { ok: true };
  } catch (e) {
    console.error("[rate-limit] store error on check; failing open", e);
    return { ok: true };
  }
}

/** Failure budget, part 2: count one failure against every hit. */
export async function recordRateLimitFailures(db: Firestore, hits: RateHit[]): Promise<void> {
  try {
    const nowMs = Date.now();
    await db.runTransaction(async (tx) => {
      const refs = hits.map(([rule, key]) => docFor(db, rule, key));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      hits.forEach(([rule], i) => {
        const r = applyHit(readState(snaps[i]), rule, nowMs);
        if (r.next) tx.set(refs[i], stateDoc(rule, r.next));
      });
    });
  } catch (e) {
    console.error("[rate-limit] store error on record; failing open", e);
  }
}

export const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a few minutes and try again.";

export function tooManyAttempts(retryAfter: number) {
  return NextResponse.json(
    { ok: false, error: TOO_MANY_ATTEMPTS, code: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfter / 1000))) } }
  );
}
