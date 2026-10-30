import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * "This phone already has a card" is a true answer a signup has to give, so it
 * is budgeted instead (audit PRV-01): each such answer costs the caller's
 * internet address one try, and once the tries are used up the signup stops
 * answering at all — before it looks at any phone number.
 */
const h = vi.hoisted(() => ({
  customers: new Set<string>(),
  reads: [] as string[],
  blocked: false,
  failures: [] as string[],
  checks: [] as string[],
  created: [] as string[],
}));

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => ({
    doc: (path: string) => ({
      path,
      get: async () => {
        h.reads.push(path);
        return { exists: h.customers.has(path), data: () => ({}) };
      },
    }),
  }),
  getAdminAuth: () => ({ createCustomToken: async () => "tok" }),
}));
vi.mock("@/lib/server/loyaltyLog", () => ({ writeLoyaltyLog: async () => {} }));
vi.mock("@/lib/server/create-customer", () => ({
  createCustomerAccount: async (_db: unknown, ref: { path: string }) => {
    h.created.push(ref.path);
    return true;
  },
}));
vi.mock("bcryptjs", () => ({ default: { hash: async () => "hash" } }));
vi.mock("@/lib/server/rate-limit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  consumeRateLimits: async () => ({ ok: true }),
  checkRateLimits: async (_db: unknown, hits: Array<[unknown, string]>) => {
    h.checks.push(hits[0][1]);
    return h.blocked ? { ok: false, retryAfterMs: 5000 } : { ok: true };
  },
  recordRateLimitFailures: async (_db: unknown, hits: Array<[unknown, string]>) => void h.failures.push(hits[0][1]),
}));

import { POST } from "@/app/api/customer/sharelebrator/signup/route";

const signup = (phone: string) =>
  POST(
    new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify({ phone, password: "secret1", name: "Cara", bday: "1995-04-02", acceptPrivacy: true }),
    })
  );

beforeEach(() => {
  h.customers = new Set(["customers/+639170000001"]);
  h.reads = [];
  h.blocked = false;
  h.failures = [];
  h.checks = [];
  h.created = [];
});

describe("signup: the 'already exists' answer is budgeted per internet address", () => {
  it("still says so, and charges the caller one try", async () => {
    const res = await signup("09170000001");
    expect(res.status).toBe(409);
    expect(h.failures).toEqual(["9.9.9.9"]);
  });

  it("a new number is created and costs nothing", async () => {
    const res = await signup("09170000005");
    expect(res.status).toBe(200);
    expect(h.created).toEqual(["customers/+639170000005"]);
    expect(h.failures).toEqual([]);
  });

  it("once the tries are used up it answers 429 without even reading the phone's card", async () => {
    h.blocked = true;
    const res = await signup("09170000001");
    expect(res.status).toBe(429);
    expect(h.reads).toEqual([]);
    expect(h.created).toEqual([]);
    // The same answer for a number that has no card: nothing to tell them apart.
    const fresh = await signup("09170000005");
    expect(fresh.status).toBe(429);
  });

  it("the budget is checked before anything is written", async () => {
    await signup("09170000005");
    expect(h.checks).toEqual(["9.9.9.9"]);
  });
});
