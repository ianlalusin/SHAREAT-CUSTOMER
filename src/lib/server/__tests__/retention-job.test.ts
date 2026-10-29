import { describe, it, expect, beforeEach } from "vitest";
import { runRetention } from "../retention-job";

/**
 * The deletion job against an in-memory Firestore. Enough of the API to run
 * the real code path: paged scans, equality queries, batches, transactions,
 * recursiveDelete — so what is pinned here is what production would do.
 */
const store = new Map<string, any>();

function applyPatch(cur: any, patch: any) {
  const out = { ...(cur || {}) };
  for (const [k, v] of Object.entries(patch)) {
    const name = (v as any)?.constructor?.name || "";
    if (name.includes("Delete")) delete out[k];
    else if (name.includes("Increment")) out[k] = Number(out[k] || 0) + Number((v as any).operand ?? (v as any)._operand);
    else out[k] = v;
  }
  return out;
}

function fakeDb(): any {
  let auto = 0;
  const ref = (path: string): any => ({
    path,
    id: path.split("/").pop(),
    get: async () => snap(path),
  });
  const snap = (path: string) => ({
    exists: store.has(path),
    id: path.split("/").pop(),
    ref: ref(path),
    data: () => store.get(path),
    get: (f: string) => store.get(path)?.[f],
  });
  const children = (col: string) =>
    [...store.keys()].filter((p) => p.startsWith(`${col}/`) && !p.slice(col.length + 1).includes("/")).sort();
  const query = (col: string, filters: Array<[string, any]> = [], lim = Infinity, after: string | null = null): any => ({
    orderBy: () => query(col, filters, lim, after),
    limit: (n: number) => query(col, filters, n, after),
    startAfter: (id: string) => query(col, filters, lim, id),
    where: (f: string, _op: string, v: any) => query(col, [...filters, [f, v]], lim, after),
    get: async () => {
      let paths = children(col).filter((p) => filters.every(([f, v]) => store.get(p)?.[f] === v));
      if (after) paths = paths.filter((p) => p.split("/").pop()! > after);
      const docs = paths.slice(0, lim).map(snap);
      return { empty: docs.length === 0, size: docs.length, docs };
    },
    add: async (d: any) => void store.set(`${col}/auto${++auto}`, d),
  });
  const write = (ops: Array<() => void>) => ops.forEach((o) => o());
  return {
    doc: ref,
    collection: (col: string) => query(col),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        update: (r: any, d: any) => ops.push(() => store.set(r.path, applyPatch(store.get(r.path), d))),
        set: (r: any, d: any, o?: any) =>
          ops.push(() => store.set(r.path, o?.merge ? applyPatch(store.get(r.path), d) : applyPatch({}, d))),
        commit: async () => write(ops),
      };
    },
    runTransaction: async (fn: any) => {
      const ops: Array<() => void> = [];
      const out = await fn({
        get: (r: any) => r.get(),
        update: (r: any, d: any) => ops.push(() => store.set(r.path, applyPatch(store.get(r.path), d))),
      });
      write(ops);
      return out;
    },
    recursiveDelete: async (r: any) => {
      for (const p of [...store.keys()]) if (p === r.path || p.startsWith(`${r.path}/`)) store.delete(p);
    },
  };
}

const NOW = Date.UTC(2028, 5, 15);
const OLD = Date.UTC(2026, 3, 20); // > 2 years before NOW
const RECENT = Date.UTC(2028, 0, 10);
const ts = (ms: number) => ({ toMillis: () => ms });
const GONE = "+639170000001";
const ACTIVE = "+639170000002";
const HELD = "+639170000003";

beforeEach(() => {
  store.clear();
  store.set(`customers/${GONE}`, {
    name: "Ana",
    pointsBalance: 40,
    createdAt: ts(OLD),
    updatedAt: ts(OLD),
    storeVisits: { lipa: { lastVisitAtMs: OLD } },
  });
  store.set(`customers/${GONE}/pointsLedger/l1`, { type: "earn", points: 40 });
  store.set(`customers/${ACTIVE}`, { name: "Ben", pointsBalance: 10, createdAt: ts(OLD), storeVisits: { lipa: { lastVisitAtMs: RECENT } } });
  store.set(`customers/${HELD}`, { name: "Cara", pointsBalance: 90, pointsReserved: 50, createdAt: ts(OLD) });
  store.set("loyaltyLogs/a", { phone: GONE, customerName: "Ana", points: 40, createdAt: ts(OLD) });
  store.set("loyaltyLogs/b", { phone: ACTIVE, customerName: "Ben", points: 10, createdAt: ts(RECENT) });
  store.set("loyaltyLogsDaily/20260420_meta", { partCount: 1 });
  store.set("loyaltyLogsDaily/20260420_0", {
    entries: [
      { phone: GONE, customerName: "Ana", points: 40 },
      { phone: ACTIVE, customerName: "Ben", points: 5 },
    ],
  });
  store.set("loyaltyRedemptions/v1", { phone: GONE, code: "ABC12", rewardName: "Free Coke", status: "used" });
  store.set("loyaltyStats/global", { totalAccounts: 3, totalPointsOutstanding: 140 });
});

describe("runRetention", () => {
  it("a check reports what is due and changes nothing", async () => {
    const before = JSON.stringify([...store.entries()].filter(([p]) => !p.startsWith("retentionRuns/")));
    const r = await runRetention(fakeDb(), { nowMs: NOW });
    expect(r).toMatchObject({ dryRun: true, scanned: 3, due: 1, kept: 1, skippedVoucherHeld: 1, deleted: 0, pointsForfeited: 40 });
    expect(r.sample[0]).toEqual({ phone: "**********001", lastActivity: "2026-04-20", points: 40 });
    expect(JSON.stringify([...store.entries()].filter(([p]) => !p.startsWith("retentionRuns/")))).toBe(before);
  });

  it("is a check unless dryRun:false is passed explicitly", async () => {
    await runRetention(fakeDb(), { nowMs: NOW, dryRun: undefined });
    expect(store.has(`customers/${GONE}`)).toBe(true);
  });

  it("a real run deletes only the inactive card and blanks it out of logs and vouchers", async () => {
    const r = await runRetention(fakeDb(), { nowMs: NOW, dryRun: false });
    expect(r.deleted).toBe(1);

    expect(store.has(`customers/${GONE}`)).toBe(false);
    expect(store.has(`customers/${GONE}/pointsLedger/l1`)).toBe(false);
    expect(store.has(`customers/${ACTIVE}`)).toBe(true);
    expect(store.has(`customers/${HELD}`)).toBe(true);

    expect(store.get("loyaltyLogs/a")).toMatchObject({ phone: null, customerName: "", points: 40 });
    expect(store.get("loyaltyLogs/b")).toMatchObject({ phone: ACTIVE, customerName: "Ben" });
    expect(store.get("loyaltyLogsDaily/20260420_0").entries).toEqual([
      { phone: null, customerName: "", points: 40, redacted: true },
      { phone: ACTIVE, customerName: "Ben", points: 5 },
    ]);
    expect(store.get("loyaltyRedemptions/v1")).toMatchObject({ phone: null, code: "ABC12", status: "used" });

    expect(store.get("loyaltyStats/global")).toMatchObject({ totalAccounts: 2, totalPointsOutstanding: 100 });
    const tomb = [...store.entries()].find(([p]) => p.startsWith("retentionDeletions/"));
    expect(tomb?.[0]).not.toContain(GONE);
    expect(JSON.stringify(tomb?.[1])).not.toContain("Ana");
  });

  it("respects the per-run cap", async () => {
    const r = await runRetention(fakeDb(), { nowMs: NOW, dryRun: false, maxDeletes: 0 });
    expect(r).toMatchObject({ deleted: 0, due: 1, moreRemain: true });
    expect(store.has(`customers/${GONE}`)).toBe(true);
  });

  it("leaves a card that was used between the scan and the delete", async () => {
    const db = fakeDb();
    const realGet = db.doc;
    // The card comes back to life right as the job re-reads it.
    db.doc = (path: string) => {
      if (path === `customers/${GONE}`) store.set(path, { ...store.get(path), updatedAt: ts(RECENT) });
      return realGet(path);
    };
    const r = await runRetention(db, { nowMs: NOW, dryRun: false });
    expect(r.deleted).toBe(0);
    expect(store.has(`customers/${GONE}`)).toBe(true);
    expect(store.get("loyaltyLogs/a")).toMatchObject({ phone: GONE });
  });

  it("deletes nothing at today's date — every card is younger than two years", async () => {
    const r = await runRetention(fakeDb(), { nowMs: Date.UTC(2026, 9, 29), dryRun: false });
    expect(r.deleted).toBe(0);
    expect(store.has(`customers/${GONE}`)).toBe(true);
  });
});
