import { describe, it, expect, vi, beforeEach } from "vitest";

/** A cardholder asks for a receive code; only the card's owner can (audit PRV-01). */
const h = vi.hoisted(() => ({
  docs: new Map<string, any>(),
  claims: {} as any,
  gate: { ok: true } as any,
  resolve: { ok: true, phone: "+639170000001" } as any,
  gateKeys: [] as string[],
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminAuth: () => ({
    verifyIdToken: async (t: string) => {
      if (t !== "good") throw new Error("bad");
      return h.claims;
    },
  }),
  getAdminDb: () => ({
    doc: (path: string) => ({
      get: async () => ({ exists: h.docs.has(path), data: () => h.docs.get(path) }),
      create: async (d: any) => {
        if (h.docs.has(path)) throw Object.assign(new Error("x"), { code: 6 });
        h.docs.set(path, d);
      },
    }),
  }),
}));
vi.mock("@/lib/server/session-link", () => ({ resolveTokenCard: async () => h.resolve }));
vi.mock("@/lib/server/rate-limit", async (orig) => ({
  ...(await orig<any>()),
  consumeRateLimits: async (_db: any, hits: any[]) => {
    h.gateKeys.push(hits[0][1]);
    return h.gate;
  },
}));

import { POST } from "@/app/api/customer/sharelebrator/receive-code/route";

const call = (token = "good") =>
  POST(new Request("http://x", { method: "POST", headers: { authorization: `Bearer ${token}` } }));

beforeEach(() => {
  h.docs.clear();
  h.claims = { customer: true, storeId: "s1", sessionId: "x1", uid: "u1" };
  h.gate = { ok: true };
  h.resolve = { ok: true, phone: "+639170000001" };
  h.gateKeys = [];
});

describe("receive-code", () => {
  it("gives the card owner a code that names their phone, shown with a dash", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(j.expiresAtMs).toBeGreaterThan(Date.now());
    const stored = h.docs.get(`transferCodes/${j.code.replace("-", "")}`);
    expect(stored.phone).toBe("+639170000001");
    // The reply carries no phone number.
    expect(JSON.stringify(j)).not.toContain("+63917");
  });

  it("works for a signed-in loyalty member too", async () => {
    h.claims = { loyaltyCustomer: true, phone: "+639170000002", uid: "+639170000002" };
    const j = await (await call()).json();
    expect(h.docs.get(`transferCodes/${j.code.replace("-", "")}`).phone).toBe("+639170000002");
  });

  it("refuses someone who is not the card owner at the table", async () => {
    h.resolve = { ok: false, reason: "other", message: "Only the diner who linked this card can use it." };
    const res = await call();
    expect(res.status).toBe(403);
    expect([...h.docs.keys()]).toEqual([]);
  });

  it("needs a token, and a customer one", async () => {
    expect((await call("nope")).status).toBe(401);
    h.claims = { uid: "staff" };
    expect((await call()).status).toBe(403);
  });

  it("limits how many codes one card can ask for", async () => {
    h.gate = { ok: false, retryAfterMs: 1000 };
    expect((await call()).status).toBe(429);
    expect(h.gateKeys).toEqual(["+639170000001"]);
    expect([...h.docs.keys()]).toEqual([]);
  });
});
