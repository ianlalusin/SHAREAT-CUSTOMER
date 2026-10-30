import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The scheduled cleanup (audit PRV-02d) can only REPORT. Deleting stays a
 * deliberate, typed action by a platform admin. The schedule reaches the app
 * with a shared secret; with no secret configured it does nothing at all.
 */
const h = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock("@/lib/firebase/admin", () => ({ getAdminDb: () => ({ fake: true }) }));
vi.mock("@/lib/server/retention-job", () => ({
  MAX_DELETES_PER_RUN: 200,
  runRetention: async (_db: any, opts: any) => {
    h.calls.push(opts);
    return { dryRun: opts.dryRun, due: 3 };
  },
}));

import { POST } from "@/app/api/cron/loyalty-retention/route";

const call = (auth?: string, body: any = {}) =>
  POST(
    new Request("http://x/api/cron/loyalty-retention", {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  h.calls = [];
  vi.stubEnv("CRON_SECRET", "s3cret-value-1234567890");
});
afterEach(() => vi.unstubAllEnvs());

describe("scheduled loyalty retention", () => {
  it("does nothing, and says so, when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer anything")).status).toBe(503);
    expect(h.calls).toEqual([]);
  });

  it("rejects a missing or wrong secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("Bearer s3cret-value-1234567891")).status).toBe(401);
    expect(h.calls).toEqual([]);
  });

  it("runs a dry run with the right secret", async () => {
    const res = await call("Bearer s3cret-value-1234567890");
    expect(res.status).toBe(200);
    expect((await res.json()).report).toMatchObject({ dryRun: true, due: 3 });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ dryRun: true, uid: "cron" });
  });

  it("can never delete, whatever the body asks for", async () => {
    await call("Bearer s3cret-value-1234567890", { dryRun: false, confirm: "DELETE", maxDeletes: 200 });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].dryRun).toBe(true);
    expect(h.calls[0].maxDeletes).toBe(0);
  });
});
