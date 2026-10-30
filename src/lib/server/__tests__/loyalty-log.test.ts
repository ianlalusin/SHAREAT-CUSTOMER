import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The loyalty log records who did what, by phone. It must not also keep the
 * full name (audit PRV-02): the same "Ana C." the diner-facing screens use.
 */
const h = vi.hoisted(() => ({ writes: [] as Array<{ path: string; data: any }> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase/admin", () => {
  const ref = (path: string) => ({ path, id: "log1", get: async () => ({ exists: false, data: () => undefined }) });
  return {
    getAdminDb: () => ({
      doc: ref,
      collection: (p: string) => ({ doc: () => ref(`${p}/log1`) }),
      runTransaction: async (fn: any) =>
        fn({
          get: async (r: any) => r.get(),
          set: (r: any, data: any) => void h.writes.push({ path: r.path, data }),
        }),
    }),
  };
});

import { writeLoyaltyLog } from "@/lib/server/loyaltyLog";

beforeEach(() => {
  h.writes = [];
});

describe("writeLoyaltyLog", () => {
  it("stores a masked name in both the entry and the daily projection", async () => {
    await writeLoyaltyLog({
      type: "account_created",
      phone: "+639170000001",
      customerName: "Ana Dela Cruz",
      actorUid: "+639170000001",
    });
    expect(h.writes.length).toBeGreaterThanOrEqual(2);
    const text = JSON.stringify(h.writes.map((w) => w.data));
    expect(text).not.toContain("Dela Cruz");
    expect(text).not.toContain("Cruz");
    expect(h.writes.find((w) => w.path === "loyaltyLogs/log1")!.data.customerName).toBe("Ana C.");
    const part = h.writes.find((w) => w.path.startsWith("loyaltyLogsDaily/") && w.data.entries)!;
    expect(JSON.stringify(part.data.entries)).toContain("Ana C.");
  });

  it("keeps a one-word name and an empty name as they are", async () => {
    await writeLoyaltyLog({ type: "login", phone: "+639170000001", customerName: "Ana", actorUid: "u" });
    expect(h.writes[0].data.customerName).toBe("Ana");
    h.writes = [];
    await writeLoyaltyLog({ type: "login_failed", phone: "+639170000001", customerName: "", actorUid: "u" });
    expect(h.writes[0].data.customerName).toBe("");
  });
});
