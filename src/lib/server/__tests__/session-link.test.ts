import { describe, it, expect } from "vitest";
import {
  canDinerUnlink,
  decideDinerLink,
  isCashierLinked,
  resolveSessionCard,
  resolveTokenCard,
  CLEARED_LINKER_FIELDS,
} from "../session-link";

const cashierLink = {
  linkedCustomerPhone: "09170000001",
  linkedCustomerName: "Ana",
  linkedByParticipantId: null,
  linkedBy: "cashier",
  linkedByUid: "uid-1",
  linkedAt: "t",
};
const dinerLink = { ...cashierLink, linkedBy: null, linkedByUid: null, linkedAt: null, linkedByParticipantId: "p1" };

describe("isCashierLinked", () => {
  it("is true only for linkedBy === 'cashier'", () => {
    expect(isCashierLinked(cashierLink)).toBe(true);
    expect(isCashierLinked(dinerLink)).toBe(false);
    expect(isCashierLinked({})).toBe(false);
    expect(isCashierLinked(null)).toBe(false);
  });
});

describe("decideDinerLink", () => {
  it("allows linking onto a missing or unlinked session", () => {
    expect(decideDinerLink(null, "0917")).toEqual({ ok: true });
    expect(decideDinerLink({ linkedCustomerPhone: null }, "0917")).toEqual({ ok: true });
  });

  it("409s when the session is locked", () => {
    const r = decideDinerLink({ linkedCustomerLockedAt: 1 }, "0917");
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("409s a different phone onto a diner link", () => {
    const r = decideDinerLink(dinerLink, "09179999999");
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((r as any).error).toContain("unlink");
  });

  it("409s a different phone onto a cashier link, without telling them to unlink", () => {
    const r = decideDinerLink(cashierLink, "09179999999");
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect((r as any).error).toContain("cashier");
    expect((r as any).error).not.toContain("unlink");
  });

  it("allows the SAME phone onto a cashier link (upgrade) and a diner link (idempotent)", () => {
    expect(decideDinerLink(cashierLink, "09170000001")).toEqual({ ok: true });
    expect(decideDinerLink(dinerLink, "09170000001")).toEqual({ ok: true });
  });
});

describe("canDinerUnlink", () => {
  it("refuses a cashier link with 403, even to the diner whose card it is", () => {
    expect(canDinerUnlink(cashierLink, "p1")).toMatchObject({ ok: false, status: 403 });
  });
  it("lets the diner who linked unlink, and is a no-op when nothing is linked", () => {
    expect(canDinerUnlink(dinerLink, "p1")).toEqual({ ok: true });
    expect(canDinerUnlink(null, "p2")).toEqual({ ok: true });
  });
  it("refuses another diner at the table (audit: B could drop A's card)", () => {
    expect(canDinerUnlink(dinerLink, "p2")).toMatchObject({ ok: false, status: 403 });
    expect(canDinerUnlink(dinerLink, "")).toMatchObject({ ok: false, status: 403 });
  });
});

describe("CLEARED_LINKER_FIELDS", () => {
  it("nulls every cashier-provenance field", () => {
    expect(CLEARED_LINKER_FIELDS).toEqual({ linkedBy: null, linkedByUid: null, linkedAt: null });
  });
});

describe("resolveSessionCard", () => {
  it("gives the card to the participant that linked it", () => {
    expect(resolveSessionCard(dinerLink, "p1")).toEqual({ ok: true, phone: "09170000001" });
  });
  it("refuses another participant at the table", () => {
    expect(resolveSessionCard(dinerLink, "p2")).toMatchObject({ ok: false, reason: "other" });
    expect(resolveSessionCard(dinerLink, "")).toMatchObject({ ok: false, reason: "other" });
  });
  it("refuses everyone on a cashier link, with its own reason", () => {
    expect(resolveSessionCard(cashierLink, "p1")).toMatchObject({ ok: false, reason: "cashier" });
    expect(resolveSessionCard({ ...cashierLink, linkedByParticipantId: "p1" }, "p1")).toMatchObject({
      ok: false,
      reason: "cashier",
    });
  });
  it("reports no card when nothing is linked", () => {
    expect(resolveSessionCard({ linkedCustomerPhone: null }, "p1")).toMatchObject({ ok: false, reason: "none" });
    expect(resolveSessionCard(null, "p1")).toMatchObject({ ok: false, reason: "none" });
  });
});

describe("resolveTokenCard", () => {
  // The session doc doubles as an open table (access on, not expired) and the
  // participant doc as an active diner, so the live gate passes unless a test says otherwise.
  const open = { customerAccessEnabled: true, customerAccessExpiresAtMs: Date.now() + 3_600_000 };
  const dbWith = (data: any, participant: any = { status: "active" }) => ({
    doc: (path: string) => ({
      get: async () => {
        const d = path.includes("customerParticipants") ? participant : data ? { ...open, ...data } : null;
        return { exists: !!d, data: () => d };
      },
    }),
  });

  it("refuses the card to a phone removed from the table (audit SEC-04)", async () => {
    expect(await resolveTokenCard(dbWith(dinerLink, { status: "revoked" }), sess("p1"))).toMatchObject({ ok: false });
    expect(await resolveTokenCard(dbWith({ ...dinerLink, customerAccessEnabled: false }), sess("p1"))).toMatchObject({ ok: false });
  });
  const sess = (participantId: string) => ({ customer: true, storeId: "s", sessionId: "x", participantId });

  it("applies the session rule to table tokens", async () => {
    expect(await resolveTokenCard(dbWith(dinerLink), sess("p1"))).toEqual({ ok: true, phone: "09170000001" });
    expect(await resolveTokenCard(dbWith(dinerLink), sess("p2"))).toMatchObject({ ok: false, reason: "other" });
    expect(await resolveTokenCard(dbWith(cashierLink), sess("p1"))).toMatchObject({ ok: false, reason: "cashier" });
    expect(await resolveTokenCard(dbWith(null), sess("p1"))).toMatchObject({ ok: false, reason: "none" });
  });
  it("trusts a loyalty-card login's own phone", async () => {
    expect(await resolveTokenCard(dbWith(null), { loyaltyCustomer: true, phone: "0917" })).toEqual({ ok: true, phone: "0917" });
    expect(await resolveTokenCard(dbWith(null), { loyaltyCustomer: true })).toMatchObject({ ok: false });
  });
  it("rejects other token types", async () => {
    expect(await resolveTokenCard(dbWith(dinerLink), {})).toMatchObject({ ok: false, reason: "none" });
  });
});
