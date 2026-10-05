import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level tests for the Sharelebrator session-link routes, against an
 * in-memory Firestore fake (docs, transactions, batches). They pin the
 * cashier-link rules end to end — including the race where another card lands
 * while bcrypt is running.
 */

type Store = Map<string, any>;
const h = vi.hoisted(() => ({
  store: new Map() as Store,
  claims: {} as Record<string, any>,
  onCompare: null as null | (() => void),
}));

function fakeDb() {
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: h.store.has(path), data: () => h.store.get(path) }),
    update: async (d: any) => apply([[path, d]]),
  });
  const apply = (writes: Array<[string, any]>) => {
    for (const [path, patch] of writes) {
      if (!h.store.has(path)) throw new Error(`NOT_FOUND: ${path}`);
      h.store.set(path, { ...h.store.get(path), ...patch });
    }
  };
  return {
    doc: ref,
    batch: () => {
      const w: Array<[string, any]> = [];
      return { update: (r: any, d: any) => void w.push([r.path, d]), commit: async () => apply(w) };
    },
    runTransaction: async (fn: any) => {
      const w: Array<[string, any]> = [];
      const tx = { get: (r: any) => r.get(), update: (r: any, d: any) => void w.push([r.path, d]) };
      const out = await fn(tx);
      apply(w);
      return out;
    },
  };
}

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => fakeDb(),
  getAdminAuth: () => ({
    verifyIdToken: async (t: string) => {
      if (!h.claims[t]) throw new Error("bad token");
      return h.claims[t];
    },
  }),
}));
vi.mock("@/lib/server/loyaltyLog", () => ({ writeLoyaltyLog: async () => {} }));
vi.mock("@/lib/server/loyalty-card", () => ({
  loadLoyaltyCard: async (_db: any, phone: string) => ({ phone, name: "Ana", pointsBalance: 100 }),
}));
vi.mock("bcryptjs", () => ({
  default: {
    compare: async () => {
      h.onCompare?.();
      return true;
    },
    hash: async () => "hash",
  },
}));

import { POST as linkPOST } from "@/app/api/customer/sharelebrator/link-session/route";
import { POST as unlinkPOST } from "@/app/api/customer/sharelebrator/unlink-session/route";
import { POST as redeemPOST } from "@/app/api/customer/sharelebrator/redeem/route";
import { POST as transferPOST } from "@/app/api/customer/sharelebrator/transfer-points/route";
import { POST as profilePOST } from "@/app/api/customer/sharelebrator/update-profile/route";
import { GET as meGET } from "@/app/api/customer/sharelebrator/me/route";
import { GET as rewardsGET } from "@/app/api/customer/sharelebrator/rewards/route";
import { POST as collectPOST } from "@/app/api/customer/sharelebrator/collect-voucher/route";

const ACTIVE = "stores/s1/activeSessions/x1";
const SESSION = "stores/s1/sessions/x1";
const ANA = "+639170000001";
const BEN = "+639170000002";

const cashierLink = {
  linkedCustomerPhone: ANA,
  linkedCustomerName: "Ana",
  linkedByParticipantId: null,
  linkedBy: "cashier",
  linkedByUid: "cashier-uid",
  linkedAt: 123,
};

function seed(link: Record<string, any>) {
  h.store.set(ACTIVE, { ...link });
  h.store.set(SESSION, { ...link });
}

function token(participantId: string) {
  const t = `t-${participantId}`;
  h.claims[t] = { customer: true, storeId: "s1", sessionId: "x1", participantId, uid: `u-${participantId}` };
  return t;
}

function req(t: string, body: any = {}) {
  return new Request("http://x", {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const login = (phone: string, extra: any = {}) => ({ mode: "login", phone, password: "secret1", ...extra });

beforeEach(() => {
  h.store.clear();
  h.claims = {};
  h.onCompare = null;
  h.store.set(`customers/${ANA}`, { name: "Ana", passwordHash: "x", pointsBalance: 100 });
  h.store.set(`customers/${BEN}`, { name: "Ben", passwordHash: "x", pointsBalance: 100 });
  h.store.set("stores/s1", { name: "Store" });
});

describe("link-session", () => {
  it("links a diner and writes no cashier provenance", async () => {
    h.store.set(ACTIVE, {});
    h.store.set(SESSION, {});
    const res = await linkPOST(req(token("p1"), login(ANA)));
    expect(res.status).toBe(200);
    for (const path of [ACTIVE, SESSION]) {
      expect(h.store.get(path)).toMatchObject({
        linkedCustomerPhone: ANA,
        linkedByParticipantId: "p1",
        linkedBy: null,
        linkedByUid: null,
        linkedAt: null,
      });
    }
  });

  it("409s a different card onto a cashier link and leaves it untouched", async () => {
    seed(cashierLink);
    const res = await linkPOST(req(token("p2"), login(BEN)));
    expect(res.status).toBe(409);
    expect(h.store.get(ACTIVE)).toEqual(cashierLink);
    expect(h.store.get(SESSION)).toEqual(cashierLink);
  });

  it("lets the SAME card upgrade a cashier link to a diner link on both docs", async () => {
    seed(cashierLink);
    const res = await linkPOST(req(token("p1"), login(ANA)));
    expect(res.status).toBe(200);
    for (const path of [ACTIVE, SESSION]) {
      expect(h.store.get(path)).toMatchObject({
        linkedCustomerPhone: ANA,
        linkedByParticipantId: "p1",
        linkedBy: null,
        linkedByUid: null,
        linkedAt: null,
      });
    }
  });

  it("race: a cashier link landing during bcrypt is NOT overwritten", async () => {
    h.store.set(ACTIVE, {});
    h.store.set(SESSION, {});
    // The pre-check saw an empty session; the cashier links Ana while bcrypt runs.
    h.onCompare = () => seed(cashierLink);
    const res = await linkPOST(req(token("p2"), login(BEN)));
    expect(res.status).toBe(409);
    expect(h.store.get(ACTIVE)).toEqual(cashierLink);
    expect(h.store.get(SESSION)).toEqual(cashierLink);
  });

  it("race: a payment lock landing during bcrypt blocks the link", async () => {
    h.store.set(ACTIVE, {});
    h.store.set(SESSION, {});
    h.onCompare = () => h.store.set(ACTIVE, { linkedCustomerLockedAt: 1 });
    const res = await linkPOST(req(token("p1"), login(ANA)));
    expect(res.status).toBe(409);
    expect(h.store.get(ACTIVE).linkedCustomerPhone).toBeUndefined();
  });

  it("re-bind (linkToSession:false) by the cashier-linked card upgrades the link", async () => {
    seed(cashierLink);
    const res = await linkPOST(req(token("p9"), login(ANA, { linkToSession: false })));
    expect(res.status).toBe(200);
    expect((await res.json()).linked).toBe(true);
    for (const path of [ACTIVE, SESSION]) {
      expect(h.store.get(path)).toMatchObject({ linkedByParticipantId: "p9", linkedBy: null, linkedByUid: null, linkedAt: null });
    }
  });

  it("re-bind by a different card leaves a cashier link alone", async () => {
    seed(cashierLink);
    const res = await linkPOST(req(token("p2"), login(BEN, { linkToSession: false })));
    expect(res.status).toBe(200);
    expect((await res.json()).linked).toBe(false);
    expect(h.store.get(ACTIVE)).toEqual(cashierLink);
  });

  it("re-bind does not touch a locked session", async () => {
    seed({ ...cashierLink, linkedCustomerLockedAt: 5 });
    await linkPOST(req(token("p9"), login(ANA, { linkToSession: false })));
    expect(h.store.get(ACTIVE).linkedBy).toBe("cashier");
  });
});

describe("unlink-session", () => {
  it("403s any diner on a cashier link and changes nothing", async () => {
    seed(cashierLink);
    const res = await unlinkPOST(req(token("p1")));
    expect(res.status).toBe(403);
    expect(h.store.get(ACTIVE)).toEqual(cashierLink);
    expect(h.store.get(SESSION)).toEqual(cashierLink);
  });

  it("unlinks a diner link and clears the provenance fields on both docs", async () => {
    seed({ ...cashierLink, linkedBy: null, linkedByParticipantId: "p1" });
    const res = await unlinkPOST(req(token("p1")));
    expect(res.status).toBe(200);
    for (const path of [ACTIVE, SESSION]) {
      expect(h.store.get(path)).toMatchObject({
        linkedCustomerPhone: null,
        linkedCustomerName: null,
        linkedByParticipantId: null,
        linkedBy: null,
        linkedByUid: null,
        linkedAt: null,
      });
    }
  });

  it("clears stale cashier provenance left on a diner link", async () => {
    seed({ ...cashierLink, linkedBy: null, linkedByUid: "stale", linkedAt: 9, linkedByParticipantId: "p1" });
    await unlinkPOST(req(token("p1")));
    expect(h.store.get(ACTIVE)).toMatchObject({ linkedByUid: null, linkedAt: null });
  });

  it("409s on a paid session", async () => {
    seed({ ...cashierLink, linkedBy: null, linkedCustomerLockedAt: 1 });
    expect((await unlinkPOST(req(token("p1")))).status).toBe(409);
    expect(h.store.get(ACTIVE).linkedCustomerPhone).toBe(ANA);
  });
});

describe("card actions are limited to the participant that linked the card", () => {
  const dinerLink = { ...cashierLink, linkedBy: null, linkedByUid: null, linkedAt: null, linkedByParticipantId: "p1" };

  it("cashier link: redeem, transfer, profile, collect are all 403 and rewards reads as unlinked", async () => {
    seed(cashierLink);
    const t = token("p1");
    expect((await redeemPOST(req(t, { rewardId: "r1" }))).status).toBe(403);
    expect((await transferPOST(req(t, { recipientPhone: BEN, points: 5 }))).status).toBe(403);
    expect((await profilePOST(req(t, { currentPassword: "secret1", name: "Hacked" }))).status).toBe(403);
    expect((await collectPOST(req(t, { voucherId: "v1" }))).status).toBe(403);
    const rewards = await rewardsGET(new Request("http://x", { headers: { authorization: `Bearer ${t}` } }));
    expect(await rewards.json()).toMatchObject({ ok: true, linked: false, vouchers: [] });
    // Nothing moved.
    expect(h.store.get(`customers/${ANA}`).pointsBalance).toBe(100);
    expect(h.store.get(`customers/${ANA}`).name).toBe("Ana");
  });

  it("diner link: a different participant at the table is refused", async () => {
    seed(dinerLink);
    const t = token("p2");
    expect((await redeemPOST(req(t, { rewardId: "r1" }))).status).toBe(403);
    expect((await transferPOST(req(t, { recipientPhone: BEN, points: 5 }))).status).toBe(403);
    expect((await profilePOST(req(t, { currentPassword: "secret1", name: "Hacked" }))).status).toBe(403);
    expect(h.store.get(`customers/${ANA}`).pointsBalance).toBe(100);
  });

  it("diner link: the linking participant can still transfer", async () => {
    seed(dinerLink);
    // transfer-points queries the points ledger; stub the collection read.
    const res = await transferPOST(req(token("p1"), { recipientPhone: "bad", points: 5 }));
    // Passes the ownership gate (then fails body validation, not 403).
    expect(res.status).toBe(400);
  });
});

describe("edge cases", () => {
  const dinerLink = { ...cashierLink, linkedBy: null, linkedByUid: null, linkedAt: null, linkedByParticipantId: "p1" };
  const noAuth = (body: any = {}) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

  it("rejects a missing or invalid token and a non-customer token", async () => {
    expect((await linkPOST(noAuth(login(ANA)))).status).toBe(401);
    expect((await unlinkPOST(noAuth())).status).toBe(401);
    expect((await unlinkPOST(req("nope"))).status).toBe(401);
    h.claims["t-staff"] = { uid: "staff" };
    expect((await unlinkPOST(req("t-staff"))).status).toBe(403);
  });

  it("matches the cashier's phone regardless of how the diner types it", async () => {
    seed(cashierLink);
    // Same card typed as 09XXXXXXXXX normalises to the cashier-linked phone: upgrade, not 409.
    const res = await linkPOST(req(token("p1"), login("09170000001")));
    expect(res.status).toBe(200);
    expect(h.store.get(ACTIVE)).toMatchObject({ linkedBy: null, linkedByParticipantId: "p1" });
  });

  it("a different phone typed in another format is still a different card", async () => {
    seed(cashierLink);
    expect((await linkPOST(req(token("p2"), login("09170000002")))).status).toBe(409);
    expect(h.store.get(ACTIVE)).toEqual(cashierLink);
  });

  it("linking works when only the sessions doc exists, and when neither exists", async () => {
    h.store.set(SESSION, {});
    expect((await linkPOST(req(token("p1"), login(ANA)))).status).toBe(200);
    expect(h.store.get(SESSION)).toMatchObject({ linkedCustomerPhone: ANA, linkedBy: null });
    expect(h.store.has(ACTIVE)).toBe(false);

    h.store.clear();
    h.store.set(`customers/${ANA}`, { name: "Ana", passwordHash: "x" });
    h.store.set("stores/s1", { name: "Store" });
    expect((await linkPOST(req(token("p1"), login(ANA)))).status).toBe(200);
    expect(h.store.has(ACTIVE)).toBe(false);
    expect(h.store.has(SESSION)).toBe(false);
  });

  it("the same diner re-linking is idempotent; a new device re-binds the participant", async () => {
    seed(dinerLink);
    expect((await linkPOST(req(token("p1"), login(ANA)))).status).toBe(200);
    expect((await linkPOST(req(token("p7"), login(ANA)))).status).toBe(200);
    expect(h.store.get(ACTIVE)).toMatchObject({ linkedCustomerPhone: ANA, linkedByParticipantId: "p7", linkedBy: null });
  });

  it("a different card onto a diner link is 409 and the message tells them to unlink", async () => {
    seed(dinerLink);
    const res = await linkPOST(req(token("p2"), login(BEN)));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("unlink");
  });

  it("the 409 for a cashier link does not tell the diner to unlink (they cannot)", async () => {
    seed(cashierLink);
    const body = await (await linkPOST(req(token("p2"), login(BEN)))).json();
    expect(body.error).toContain("cashier");
    expect(body.error).not.toContain("unlink");
  });

  it("re-bind without a participantId cannot upgrade a cashier link", async () => {
    seed(cashierLink);
    const t = "t-nopid";
    h.claims[t] = { customer: true, storeId: "s1", sessionId: "x1", uid: "u" };
    const res = await linkPOST(req(t, login(ANA, { linkToSession: false })));
    expect((await res.json()).linked).toBe(true); // they proved the card…
    expect(h.store.get(ACTIVE).linkedBy).toBe("cashier"); // …but nothing to bind to, link unchanged
  });

  it("wrong password changes nothing", async () => {
    seed(cashierLink);
    h.onCompare = null;
    const bcrypt = (await import("bcryptjs")).default as any;
    const spy = vi.spyOn(bcrypt, "compare").mockResolvedValueOnce(false);
    const res = await linkPOST(req(token("p1"), login(ANA)));
    spy.mockRestore();
    expect(res.status).toBe(401);
    expect(h.store.get(ACTIVE)).toEqual(cashierLink);
  });

  it("unlink with nothing linked or no session docs is a harmless 200", async () => {
    expect((await unlinkPOST(req(token("p1")))).status).toBe(200);
    seed({});
    expect((await unlinkPOST(req(token("p1")))).status).toBe(200);
  });

  it("unlink handles a link written before linkedBy existed, and a non-cashier linkedBy value", async () => {
    const legacy: any = { linkedCustomerPhone: ANA, linkedCustomerName: "Ana", linkedByParticipantId: "p1" };
    seed(legacy);
    expect((await unlinkPOST(req(token("p1")))).status).toBe(200);
    expect(h.store.get(ACTIVE).linkedCustomerPhone).toBeNull();
    seed({ ...legacy, linkedBy: "diner" });
    expect((await unlinkPOST(req(token("p1")))).status).toBe(200);
  });

  it("unlink refuses a cashier link even when only the active doc exists", async () => {
    h.store.set(ACTIVE, { ...cashierLink });
    expect((await unlinkPOST(req(token("p1")))).status).toBe(403);
    expect(h.store.get(ACTIVE)).toEqual(cashierLink);
  });

  it("a cashier link blocks even its own participant id (cashier links have no owner)", async () => {
    seed({ ...cashierLink, linkedByParticipantId: "p1" });
    expect((await redeemPOST(req(token("p1"), { rewardId: "r1" }))).status).toBe(403);
    expect((await transferPOST(req(token("p1"), { recipientPhone: BEN, points: 5 }))).status).toBe(403);
  });

  it("legacy diner link with no linkedByParticipantId, or a token with no participantId, is refused", async () => {
    seed({ ...cashierLink, linkedBy: null, linkedByParticipantId: null });
    expect((await redeemPOST(req(token("p1"), { rewardId: "r1" }))).status).toBe(403);
    seed({ ...cashierLink, linkedBy: null, linkedByParticipantId: "p1" });
    h.claims["t-nopid"] = { customer: true, storeId: "s1", sessionId: "x1", uid: "u" };
    expect((await redeemPOST(req("t-nopid", { rewardId: "r1" }))).status).toBe(403);
  });

  it("no card linked at all: 403 (redeem/collect), 400 (transfer), 404 (profile)", async () => {
    seed({});
    const t = token("p1");
    expect((await redeemPOST(req(t, { rewardId: "r1" }))).status).toBe(403);
    expect((await collectPOST(req(t, { voucherId: "v1" }))).status).toBe(403);
    expect((await transferPOST(req(t, { recipientPhone: BEN, points: 5 }))).status).toBe(400);
    expect((await profilePOST(req(t, { currentPassword: "secret1" }))).status).toBe(404);
  });

  it("loyalty-card-login tokens are unaffected by the session link", async () => {
    seed(cashierLink);
    h.claims["t-loy"] = { loyaltyCustomer: true, phone: BEN, uid: "u-loy" };
    // Passes the card gate (BEN's own phone) and reaches the voucher lookup.
    expect((await collectPOST(req("t-loy", { voucherId: "missing" }))).status).toBe(400);
    const prof = await profilePOST(req("t-loy", { currentPassword: "secret1", name: "Benny" }));
    expect(prof.status).toBe(200);
    expect(h.store.get(`customers/${BEN}`).name).toBe("Benny");
    // …and the cashier link on the session was not touched.
    expect(h.store.get(ACTIVE)).toEqual(cashierLink);
  });

  it("the linking participant's profile edit syncs the session name and keeps the link intact", async () => {
    seed({ ...cashierLink, linkedBy: null, linkedByParticipantId: "p1" });
    const res = await profilePOST(req(token("p1"), { currentPassword: "secret1", name: "Anita" }));
    expect(res.status).toBe(200);
    expect(h.store.get(ACTIVE)).toMatchObject({ linkedCustomerName: "Anita", linkedByParticipantId: "p1" });
    expect(h.store.get(SESSION).linkedCustomerName).toBe("Anita");
  });
});

describe("/me tells the diner who to ask", () => {
  const get = (t: string) => meGET(new Request("http://x", { headers: { authorization: `Bearer ${t}` } }));

  it("flags a cashier link as byCashier, with only the display name", async () => {
    seed(cashierLink);
    const body = await (await get(token("p2"))).json();
    expect(body).toEqual({
      ok: true,
      linked: false,
      sessionLink: { byOther: true, byCashier: true, name: "Ana" },
    });
  });

  it("flags another diner's link as not byCashier", async () => {
    seed({ ...cashierLink, linkedBy: null, linkedByUid: null, linkedAt: null, linkedByParticipantId: "p1" });
    const body = await (await get(token("p2"))).json();
    expect(body.sessionLink).toEqual({ byOther: true, byCashier: false, name: "Ana" });
  });

  it("still hides the card from the cashier-linked table's diners but not from an upgraded diner", async () => {
    seed(cashierLink);
    expect((await (await get(token("p1"))).json()).linked).toBe(false);
    await linkPOST(req(token("p1"), login(ANA))); // same card upgrades the link
    const body = await (await get(token("p1"))).json();
    expect(body.linked).toBe(true);
    expect(body.sessionLink).toBeUndefined();
  });
});
