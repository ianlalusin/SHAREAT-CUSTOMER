import { describe, it, expect } from "vitest";
import { loadLoyaltyCard, loadEditableProfile } from "@/lib/server/loyalty-card";
import { birthMonthDay, formatBirthday } from "@/lib/birthday";

/**
 * Card reads return only what the card screen shows (audit PRV-02): no street
 * address, no email, no birth year, and no phone numbers of the people in the
 * points history. The edit form gets the private fields from a separate read.
 */
const PHONE = "+639170000001";

function fakeDb() {
  const ledger = [
    {
      type: "transfer_out", points: -10, amount: 0, storeId: "s1", sessionId: "x1",
      recipientName: "Ben Reyes", recipientPhone: "+639170000002", senderName: "Ana Dela Cruz", senderPhone: PHONE,
      createdAt: { toMillis: () => 1000 },
    },
  ];
  return {
    doc: (path: string) => ({
      get: async () =>
        path === `customers/${PHONE}`
          ? {
              exists: true,
              data: () => ({
                phone: PHONE, name: "Ana Dela Cruz", bday: "1995-04-02",
                address: "12 Rizal St, Cebu", email: "ana@example.com",
                pointsBalance: 50, pointsReserved: 10,
              }),
            }
          : { exists: false, data: () => undefined },
    }),
    collection: () => ({
      orderBy: () => ({
        limit: () => ({ get: async () => ({ docs: ledger.map((d, i) => ({ id: `l${i}`, data: () => d })) }) }),
      }),
    }),
  } as any;
}

describe("card read", () => {
  it("returns no address, no email, no birth year", async () => {
    const card = await loadLoyaltyCard(fakeDb(), PHONE);
    const c = card!.customer as any;
    expect(c).toEqual({
      phone: PHONE, name: "Ana Dela Cruz", birthday: "04-02",
      pointsBalance: 50, pointsReserved: 10, available: 40,
    });
    expect(JSON.stringify(card)).not.toMatch(/Rizal|ana@example|1995/);
  });

  it("shows counterparty names masked, and not their phone numbers", async () => {
    const card = await loadLoyaltyCard(fakeDb(), PHONE);
    const e = card!.ledger[0] as any;
    expect(e.recipientName).toBe("Ben R.");
    expect(e.senderName).toBe("Ana C.");
    expect(e).not.toHaveProperty("recipientPhone");
    expect(e).not.toHaveProperty("senderPhone");
    expect(JSON.stringify(card)).not.toContain("+639170000002");
    expect(JSON.stringify(card!.ledger)).not.toMatch(/Reyes|Dela Cruz/);
  });

  it("returns null for an unknown card", async () => {
    expect(await loadLoyaltyCard(fakeDb(), "+639999999999")).toBeNull();
  });
});

describe("editable profile read", () => {
  it("returns the private fields the edit form needs", async () => {
    expect(await loadEditableProfile(fakeDb(), PHONE)).toEqual({
      address: "12 Rizal St, Cebu", email: "ana@example.com", bday: "1995-04-02",
    });
  });
  it("is null for an unknown card", async () => {
    expect(await loadEditableProfile(fakeDb(), "+639999999999")).toBeNull();
  });
});

describe("birthday helpers", () => {
  it("keeps only month and day", () => {
    expect(birthMonthDay("1995-04-02")).toBe("04-02");
    expect(birthMonthDay("")).toBeNull();
    expect(birthMonthDay(undefined)).toBeNull();
    expect(birthMonthDay("garbage")).toBeNull();
  });
  it("formats like the screen did before", () => {
    expect(formatBirthday("04-02")).toBe("April 2");
    expect(formatBirthday("12-25")).toBe("December 25");
    expect(formatBirthday(null)).toBe("");
  });
});
