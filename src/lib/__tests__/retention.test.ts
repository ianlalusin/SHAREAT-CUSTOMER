import { describe, it, expect } from "vitest";
import {
  lastActivityMs,
  manilaDayId,
  maskPhone,
  redactEntries,
  retentionCutoffMs,
  retentionDecision,
  toMillis,
} from "@/lib/retention";

const DAY = 86_400_000;
const NOW = Date.UTC(2028, 5, 15, 4, 0); // 15 Jun 2028, noon Manila
const ts = (ms: number) => ({ toMillis: () => ms });
const YEARS = 2;

describe("lastActivityMs", () => {
  it("takes the latest of any branch visit, creation and last change", () => {
    const c = {
      createdAt: ts(Date.UTC(2026, 3, 1)),
      updatedAt: ts(Date.UTC(2026, 6, 1)),
      storeVisits: { lipa: { lastVisitAtMs: Date.UTC(2026, 8, 1) }, malvar: { lastVisitAtMs: Date.UTC(2026, 4, 1) } },
    };
    expect(lastActivityMs(c)).toBe(Date.UTC(2026, 8, 1));
  });

  it("falls back to creation when visits predate last-visit stamping", () => {
    expect(lastActivityMs({ createdAt: ts(Date.UTC(2026, 2, 5)), storeVisits: { lipa: { visits: 3 } } })).toBe(
      Date.UTC(2026, 2, 5)
    );
  });

  it("is null when the card carries no date at all", () => {
    expect(lastActivityMs({ name: "Ana", storeVisits: {} })).toBeNull();
  });

  it("reads Firestore Timestamps, serialised ones, and plain numbers", () => {
    expect(toMillis(ts(5))).toBe(5);
    expect(toMillis({ _seconds: 2 })).toBe(2000);
    expect(toMillis(7)).toBe(7);
    expect(toMillis("x")).toBeNull();
  });
});

describe("retentionDecision", () => {
  const cutoff = retentionCutoffMs(NOW, YEARS);

  it("cuts off at the same calendar day two years back", () => {
    expect(new Date(cutoff).toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("deletes a card with no activity for more than two years", () => {
    const c = { createdAt: ts(cutoff - DAY), storeVisits: { lipa: { lastVisitAtMs: cutoff - 2 * DAY } } };
    expect(retentionDecision(c, NOW, YEARS)).toMatchObject({ action: "delete" });
  });

  it("keeps a card used a day inside the window — a visit, a transfer or an edit all count", () => {
    expect(retentionDecision({ createdAt: ts(cutoff - 900 * DAY), updatedAt: ts(cutoff + DAY) }, NOW, YEARS)).toMatchObject({
      action: "keep",
    });
    expect(
      retentionDecision({ createdAt: ts(cutoff - 900 * DAY), storeVisits: { x: { lastVisitAtMs: cutoff + DAY } } }, NOW, YEARS)
    ).toMatchObject({ action: "keep" });
  });

  it("never deletes a card holding points for an unredeemed voucher", () => {
    expect(retentionDecision({ createdAt: ts(cutoff - 900 * DAY), pointsReserved: 50 }, NOW, YEARS)).toMatchObject({
      action: "skip",
      reason: "voucher-held",
    });
  });

  it("never deletes a card it has no date to judge by", () => {
    expect(retentionDecision({ name: "Old" }, NOW, YEARS)).toMatchObject({ action: "skip", reason: "no-date" });
  });

  it("deletes nothing made since the app launched until March 2028", () => {
    const launched = { createdAt: ts(Date.UTC(2026, 2, 1)) };
    expect(retentionDecision(launched, Date.UTC(2026, 9, 29), YEARS).action).toBe("keep");
    expect(retentionDecision(launched, Date.UTC(2028, 1, 28), YEARS).action).toBe("keep");
    expect(retentionDecision(launched, Date.UTC(2028, 2, 2), YEARS).action).toBe("delete");
  });
});

describe("helpers", () => {
  it("keys log days in Manila time", () => {
    expect(manilaDayId(Date.UTC(2026, 9, 29, 17, 0))).toBe("20261030"); // 1 AM Manila next day
  });

  it("blanks only this person's log entries and keeps the numbers", () => {
    const entries = [
      { phone: "+639170000001", customerName: "Ana", points: 10 },
      { phone: "+639170000002", customerName: "Ben", points: 5 },
    ];
    expect(redactEntries(entries, "+639170000001")).toEqual([
      { phone: null, customerName: "", points: 10, redacted: true },
      { phone: "+639170000002", customerName: "Ben", points: 5 },
    ]);
    expect(redactEntries(entries, "+639179999999")).toBeNull();
  });

  it("masks phones in reports", () => {
    expect(maskPhone("+639170000123")).toBe("**********123");
  });
});
