import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The recipient lookup must carry the phone number in a POST body, never in the
 * URL (audit PRV-01): URLs end up in access logs, browser history and referrers.
 */
const h = vi.hoisted(() => ({
  customers: new Map<string, any>(),
  claims: { customer: true, uid: "u1" } as any,
  gate: { ok: true } as any,
  budgetKeys: [] as string[],
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
      get: async () => {
        const id = path.replace("customers/", "");
        return { exists: h.customers.has(id), data: () => h.customers.get(id) };
      },
    }),
  }),
}));
vi.mock("@/lib/server/rate-limit", async (orig) => ({
  ...(await orig<any>()),
  consumeRateLimits: async (_db: any, rules: any[]) => {
    h.budgetKeys.push(rules[0][1]);
    return h.gate;
  },
}));

import * as route from "@/app/api/customer/sharelebrator/lookup-recipient/route";

const post = (body: any, token = "good") =>
  new Request("http://x/api/customer/sharelebrator/lookup-recipient", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  h.customers.clear();
  h.customers.set("+639170000001", { name: "Ana Dela Cruz" });
  h.claims = { customer: true, uid: "u1" };
  h.gate = { ok: true };
  h.budgetKeys = [];
});

describe("lookup-recipient takes the phone in the POST body", () => {
  it("has no GET handler, so a phone in the URL is never read", () => {
    expect((route as any).GET).toBeUndefined();
  });

  it("returns the masked name for a phone sent in the body", async () => {
    const res = await route.POST(post({ phone: "09170000001" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: "Ana C." });
  });

  it("rejects a missing or malformed body with 400 and spends no lookup budget", async () => {
    expect((await route.POST(post("not json"))).status).toBe(400);
    expect((await route.POST(post({}))).status).toBe(400);
    expect((await route.POST(post({ phone: "abc" }))).status).toBe(400);
    expect(h.budgetKeys).toEqual([]);
  });

  it("still needs a valid customer token", async () => {
    expect((await route.POST(post({ phone: "09170000001" }, "nope"))).status).toBe(401);
    h.claims = { uid: "staff" };
    expect((await route.POST(post({ phone: "09170000001" }))).status).toBe(403);
  });

  it("still spends the per-account budget and honours it", async () => {
    await route.POST(post({ phone: "09170000001" }));
    expect(h.budgetKeys).toEqual(["u1"]);
    h.gate = { ok: false, retryAfterMs: 1000 };
    expect((await route.POST(post({ phone: "09170000001" }))).status).toBe(429);
  });
});
