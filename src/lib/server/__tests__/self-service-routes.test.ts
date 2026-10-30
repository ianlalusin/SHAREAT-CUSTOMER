import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A cardholder downloads or deletes their own data from inside the app (audit
 * PRV-02a). Both need the card's owner AND their password, and wrong passwords
 * are budgeted like logins. Deleting also needs the word DELETE typed.
 */
const h = vi.hoisted(() => ({
  docs: new Map<string, any>(),
  claims: {} as any,
  resolve: { ok: true, phone: "+639170000001" } as any,
  blocked: false,
  failures: [] as string[],
  erased: [] as any[],
  deletedUsers: [] as string[],
  compareOk: true,
}));

function fakeDb() {
  const ref = (path: string): any => ({
    path,
    get: async () => ({ exists: h.docs.has(path), data: () => h.docs.get(path) }),
  });
  const under = (col: string) =>
    [...h.docs.entries()].filter(([p]) => p.startsWith(`${col}/`) && !p.slice(col.length + 1).includes("/"));
  const colRef = (col: string, filters: Array<[string, unknown]> = []): any => ({
    where: (f: string, _o: string, v: unknown) => colRef(col, [...filters, [f, v]]),
    orderBy: () => colRef(col, filters),
    limit: () => colRef(col, filters),
    get: async () => ({
      docs: under(col)
        .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
        .map(([p, d]) => ({ id: p.split("/").pop(), data: () => d })),
    }),
  });
  return {
    doc: ref,
    collection: colRef,
    runTransaction: async (fn: any) => {
      const writes: Array<[string, any]> = [];
      const out = await fn({ get: (r: any) => r.get(), update: (r: any, d: any) => void writes.push([r.path, d]) });
      for (const [p, d] of writes) h.docs.set(p, { ...h.docs.get(p), ...d });
      return out;
    },
  };
}

vi.mock("@/lib/firebase/admin", () => ({
  getAdminAuth: () => ({
    verifyIdToken: async (t: string) => {
      if (t !== "good") throw new Error("bad");
      return h.claims;
    },
    deleteUser: async (uid: string) => void h.deletedUsers.push(uid),
  }),
  getAdminDb: () => fakeDb(),
}));
vi.mock("@/lib/server/session-link", async (orig) => ({
  ...(await orig<any>()),
  resolveTokenCard: async () => h.resolve,
}));
vi.mock("@/lib/server/rate-limit", async (orig) => ({
  ...(await orig<any>()),
  checkRateLimits: async () => (h.blocked ? { ok: false, retryAfterMs: 5000 } : { ok: true }),
  recordRateLimitFailures: async (_db: any, hits: any[]) => void h.failures.push(hits[0][1]),
}));
vi.mock("@/lib/server/retention-job", () => ({
  eraseCard: async (_db: any, phone: string, _now: number, why: any) => {
    h.erased.push({ phone, why });
    return { points: Number(h.docs.get(`customers/${phone}`)?.pointsBalance || 0) };
  },
}));
vi.mock("bcryptjs", () => ({ default: { compare: async () => h.compareOk } }));

import { POST as exportPOST } from "@/app/api/customer/sharelebrator/export-data/route";
import { POST as deletePOST } from "@/app/api/customer/sharelebrator/delete-account/route";

const PHONE = "+639170000001";
const post = (handler: (r: Request) => Promise<Response>, body: any, token = "good") =>
  handler(
    new Request("http://x", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  h.docs.clear();
  h.docs.set(`customers/${PHONE}`, {
    phone: PHONE, name: "Ana Dela Cruz", email: "ana@example.com", address: "12 Rizal St", bday: "1995-04-02",
    pointsBalance: 40, pointsReserved: 0, passwordHash: "SECRET-HASH", privacyNoticeVersion: "2026-10-29",
    createdAt: { toMillis: () => 1_700_000_000_000 },
  });
  h.docs.set(`customers/${PHONE}/pointsLedger/l1`, {
    type: "transfer_out", points: -5, amount: 0, storeId: "", sessionId: "",
    recipientName: "Ben Reyes", recipientPhone: "+639170000002", createdAt: { toMillis: () => 1_700_000_100_000 },
  });
  h.docs.set("loyaltyRedemptions/v1", {
    phone: PHONE, code: "ABC12", rewardName: "Free Coke", pointsCost: 20, status: "used",
    createdAtClientMs: 1_700_000_200_000, internalNote: "staff-only",
  });
  h.docs.set("loyaltyRedemptions/v2", { phone: "+639170000009", code: "NOPE", rewardName: "Someone else" });
  h.claims = { loyaltyCustomer: true, phone: PHONE, uid: PHONE };
  h.resolve = { ok: true, phone: PHONE };
  h.blocked = false;
  h.failures = [];
  h.erased = [];
  h.deletedUsers = [];
  h.compareOk = true;
});

describe("export-data", () => {
  it("gives the cardholder their own data, and nothing secret or about other people", async () => {
    const res = await post(exportPOST, { password: "secret1" });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.data.profile).toMatchObject({
      phone: PHONE, name: "Ana Dela Cruz", email: "ana@example.com", address: "12 Rizal St", birthday: "1995-04-02",
    });
    expect(j.data.points).toMatchObject({ balance: 40 });
    expect(j.data.vouchers).toHaveLength(1);
    expect(j.data.vouchers[0]).toMatchObject({ code: "ABC12", rewardName: "Free Coke", status: "used" });
    expect(j.data.history).toHaveLength(1);
    const text = JSON.stringify(j);
    expect(text).not.toContain("SECRET-HASH");
    expect(text).not.toContain("staff-only");
    expect(text).not.toContain("NOPE");
    // Other people in the history are masked and their phone numbers are left out.
    expect(text).not.toContain("Reyes");
    expect(text).not.toContain("+639170000002");
    expect(j.data.history[0].counterparty).toBe("Ben R.");
  });

  it("a wrong password gets nothing and counts as a failed attempt", async () => {
    h.compareOk = false;
    const res = await post(exportPOST, { password: "nope" });
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain("Ana");
    expect(h.failures).toEqual([PHONE]);
  });

  it("needs a password at all", async () => {
    expect((await post(exportPOST, {})).status).toBe(400);
    expect((await post(exportPOST, "not json")).status).toBe(400);
  });

  it("stops answering after too many wrong passwords", async () => {
    h.blocked = true;
    expect((await post(exportPOST, { password: "secret1" })).status).toBe(429);
  });

  it("refuses a diner who is not the card's owner at the table, and a bad token", async () => {
    h.claims = { customer: true, storeId: "s1", sessionId: "x1", uid: "u1" };
    h.resolve = { ok: false, reason: "other", message: "Only the diner who linked this card can use it." };
    expect((await post(exportPOST, { password: "secret1" })).status).toBe(403);
    expect((await post(exportPOST, { password: "secret1" }, "nope")).status).toBe(401);
  });
});

describe("delete-account", () => {
  it("erases the card for the owner who gives the password and types DELETE", async () => {
    const res = await post(deletePOST, { password: "secret1", confirm: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pointsForfeited: 40 });
    expect(h.erased).toHaveLength(1);
    expect(h.erased[0].phone).toBe(PHONE);
    expect(h.erased[0].why.reason).toMatch(/cardholder/);
    expect(h.deletedUsers).toEqual([PHONE]);
  });

  it("does nothing without the exact word DELETE", async () => {
    for (const confirm of [undefined, "delete", "yes", " DELETE "]) {
      expect((await post(deletePOST, { password: "secret1", confirm })).status).toBe(400);
    }
    expect(h.erased).toEqual([]);
  });

  it("does nothing on a wrong password, and counts it", async () => {
    h.compareOk = false;
    expect((await post(deletePOST, { password: "nope", confirm: "DELETE" })).status).toBe(401);
    expect(h.erased).toEqual([]);
    expect(h.failures).toEqual([PHONE]);
  });

  it("is blocked while a claimed reward is holding points", async () => {
    h.docs.set(`customers/${PHONE}`, { ...h.docs.get(`customers/${PHONE}`), pointsReserved: 20 });
    const res = await post(deletePOST, { password: "secret1", confirm: "DELETE" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/reward/i);
    expect(h.erased).toEqual([]);
  });

  it("is refused for someone who is not the card's owner", async () => {
    h.claims = { customer: true, storeId: "s1", sessionId: "x1", uid: "u1" };
    h.resolve = { ok: false, reason: "other", message: "Only the diner who linked this card can use it." };
    expect((await post(deletePOST, { password: "secret1", confirm: "DELETE" })).status).toBe(403);
    expect(h.erased).toEqual([]);
  });

  it("drops the card off the table the diner is sitting at, unless the bill is already paid", async () => {
    h.claims = { customer: true, storeId: "s1", sessionId: "x1", participantId: "p1", uid: "u1" };
    const link = { linkedCustomerPhone: PHONE, linkedCustomerName: "Ana", linkedByParticipantId: "p1" };
    h.docs.set("stores/s1/activeSessions/x1", { ...link });
    h.docs.set("stores/s1/sessions/x1", { ...link });
    expect((await post(deletePOST, { password: "secret1", confirm: "DELETE" })).status).toBe(200);
    expect(h.docs.get("stores/s1/activeSessions/x1")).toMatchObject({ linkedCustomerPhone: null, linkedCustomerName: null });
    expect(h.docs.get("stores/s1/sessions/x1")).toMatchObject({ linkedCustomerPhone: null });

    // Paid and locked: the link is part of a closed bill and stays as it is.
    h.erased = [];
    const locked = { ...link, linkedCustomerLockedAt: 123 };
    h.docs.set("stores/s1/activeSessions/x1", { ...locked });
    h.docs.set("stores/s1/sessions/x1", { ...locked });
    expect((await post(deletePOST, { password: "secret1", confirm: "DELETE" })).status).toBe(200);
    expect(h.docs.get("stores/s1/activeSessions/x1")).toMatchObject({ linkedCustomerPhone: PHONE });
  });
});
