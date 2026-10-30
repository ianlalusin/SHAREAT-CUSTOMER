import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The recipient is named by a receive code, never a phone number (audit
 * PRV-01). Every wrong, expired or malformed code gets the SAME answer, and
 * wrong guesses are budgeted per account — so nothing here can be used to ask
 * "does this phone have a card?".
 */
const h = vi.hoisted(() => ({
  docs: new Map<string, any>(),
  claims: { customer: true, uid: "u1" } as any,
  blocked: false,
  failures: [] as string[],
  checks: [] as string[],
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
    }),
  }),
}));
vi.mock("@/lib/server/rate-limit", async (orig) => ({
  ...(await orig<any>()),
  checkRateLimits: async (_db: any, hits: any[]) => {
    h.checks.push(hits[0][1]);
    return h.blocked ? { ok: false, retryAfterMs: 5000 } : { ok: true };
  },
  recordRateLimitFailures: async (_db: any, hits: any[]) => void h.failures.push(hits[0][1]),
}));

import * as route from "@/app/api/customer/sharelebrator/lookup-recipient/route";

const post = (body: any, token = "good") =>
  new Request("http://x/api/customer/sharelebrator/lookup-recipient", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const LIVE = { phone: "+639170000001", expiresAtMs: Date.now() + 60_000 };

beforeEach(() => {
  h.docs.clear();
  h.docs.set("customers/+639170000001", { name: "Ana Dela Cruz" });
  h.docs.set("transferCodes/ABCDEF", LIVE);
  h.claims = { customer: true, uid: "u1" };
  h.blocked = false;
  h.failures = [];
  h.checks = [];
});

describe("lookup-recipient by receive code", () => {
  it("has no GET handler", () => {
    expect((route as any).GET).toBeUndefined();
  });

  it("returns only the masked name for a live code, however it is typed", async () => {
    for (const typed of ["ABCDEF", "abc-def", " a b c d e f "]) {
      const res = await route.POST(post({ code: typed }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, name: "Ana C." });
    }
    expect(h.failures).toEqual([]);
  });

  it("does not use the code up: the transfer does that", async () => {
    await route.POST(post({ code: "ABCDEF" }));
    expect(h.docs.has("transferCodes/ABCDEF")).toBe(true);
  });

  it("answers an unknown, expired and malformed code identically, and counts each as a failed guess", async () => {
    h.docs.set("transferCodes/ZZZZZZ", { phone: "+639170000001", expiresAtMs: Date.now() - 1 });
    const answers: any[] = [];
    for (const code of ["QQQQQQ", "ZZZZZZ", "nope", "", undefined]) {
      const res = await route.POST(post({ code }));
      answers.push([res.status, await res.json()]);
    }
    for (const a of answers) expect(a).toEqual(answers[0]);
    expect(answers[0][0]).toBe(404);
    expect(JSON.stringify(answers[0][1])).not.toMatch(/phone|account|number/i);
    expect(h.failures).toHaveLength(5);
  });

  it("ignores a phone number: it cannot be used to look anyone up", async () => {
    const res = await route.POST(post({ phone: "09170000001" }));
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("Ana");
  });

  it("stops answering a caller who has used up their wrong guesses", async () => {
    h.blocked = true;
    const res = await route.POST(post({ code: "ABCDEF" }));
    expect(res.status).toBe(429);
    expect(JSON.stringify(await res.json())).not.toContain("Ana");
  });

  it("budgets per signed-in account", async () => {
    await route.POST(post({ code: "QQQQQQ" }));
    expect(h.checks).toEqual(["u1"]);
    expect(h.failures).toEqual(["u1"]);
  });

  it("rejects bad JSON", async () => {
    expect((await route.POST(post("not json"))).status).toBe(400);
  });

  it("still needs a valid customer token", async () => {
    expect((await route.POST(post({ code: "ABCDEF" }, "nope"))).status).toBe(401);
    h.claims = { uid: "staff" };
    expect((await route.POST(post({ code: "ABCDEF" }))).status).toBe(403);
  });
});
