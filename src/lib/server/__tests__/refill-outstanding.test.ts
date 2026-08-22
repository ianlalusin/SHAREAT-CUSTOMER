import { describe, it, expect } from "vitest";
import {
  refillIdsOnTicket,
  servedStampsFrom,
  ticketBlocks,
  ticketIsPendingFirstServing,
  ticketServedAtMs,
} from "@/lib/server/refill-outstanding";
import { OUTSTANDING_BLOCK_MAX_MS } from "@/lib/refill-cooldown";
import { FIRST_SERVING_BLOCK_MAX_MS, hasPendingFirstServing } from "@/lib/session-orders";

const T0 = 1_700_000_000_000;
const ME = "participant_1";

const ticket = (over: Record<string, any> = {}): Record<string, any> => ({
  type: "refill",
  createdByParticipantId: ME,
  status: "preparing",
  createdAtClientMs: T0,
  itemId: "pork",
  ...over,
});

describe("refillIdsOnTicket", () => {
  it("covers the ticket's own itemId", () => {
    expect(refillIdsOnTicket(ticket())).toEqual(["pork"]);
  });

  it("expands a bundled 'Other Refills' ticket through refillIds", () => {
    // The bundle's itemId is a label, not a refill id. The real ids ride on
    // refillIds; missing them makes bundled sides never block.
    const bundled = ticket({ itemId: "OTHER_REFILLS", refillIds: ["rice", "kimchi"] });
    expect(refillIdsOnTicket(bundled).sort()).toEqual(["OTHER_REFILLS", "kimchi", "rice"]);
  });

  it("covers a repeat-first-order ticket whose itemId is a package marker", () => {
    const repeat = ticket({ itemId: "repeat_first_order_pkg1", refillIds: ["pork"] });
    expect(refillIdsOnTicket(repeat).sort()).toEqual(["pork", "repeat_first_order_pkg1"]);
  });

  it("ignores refillRequest — it is keyed by display name, not by id", () => {
    // This is the bug that shipped past unit tests once: {"Cheese": 1} keys are
    // names the KDS renders. Treating them as ids blocks nothing and could only
    // ever produce a false match.
    const bundled = ticket({ itemId: "OTHER_REFILLS", refillRequest: { Cheese: 1, Rice: 1 } });
    expect(refillIdsOnTicket(bundled)).toEqual(["OTHER_REFILLS"]);
  });

  it("survives a missing or malformed refillIds", () => {
    expect(refillIdsOnTicket(ticket({ refillIds: null }))).toEqual(["pork"]);
    expect(refillIdsOnTicket(ticket({ refillIds: "rice" }))).toEqual(["pork"]);
    expect(refillIdsOnTicket(ticket({ refillIds: ["", null, "rice"] }))).toEqual(["pork", "rice"]);
    expect(refillIdsOnTicket({})).toEqual([]);
  });

  it("does not repeat an id that is both the itemId and in refillIds", () => {
    expect(refillIdsOnTicket(ticket({ refillIds: ["pork"] }))).toEqual(["pork"]);
  });
});

describe("ticketBlocks", () => {
  it("blocks while the guest's refill is still with the kitchen", () => {
    expect(ticketBlocks(ticket(), ME, T0 + 5_000)).toBe(true);
    expect(ticketBlocks(ticket({ status: "partially_served" }), ME, T0 + 5_000)).toBe(true);
  });

  it("stops blocking once served or cancelled", () => {
    expect(ticketBlocks(ticket({ status: "served" }), ME, T0 + 5_000)).toBe(false);
    expect(ticketBlocks(ticket({ status: "cancelled" }), ME, T0 + 5_000)).toBe(false);
  });

  it("is per phone — another guest's ticket never blocks mine", () => {
    expect(ticketBlocks(ticket({ createdByParticipantId: "someone_else" }), ME, T0 + 5_000)).toBe(false);
  });

  it("ignores non-refill tickets", () => {
    expect(ticketBlocks(ticket({ type: "addon" }), ME, T0 + 5_000)).toBe(false);
    expect(ticketBlocks(ticket({ type: "package" }), ME, T0 + 5_000)).toBe(false);
  });

  it("releases a ticket the kitchen never closed — the safety valve", () => {
    // Still "preparing" hours later. Without the cap this meat would be locked
    // for this phone forever.
    expect(ticketBlocks(ticket(), ME, T0 + OUTSTANDING_BLOCK_MAX_MS - 1)).toBe(true);
    expect(ticketBlocks(ticket(), ME, T0 + OUTSTANDING_BLOCK_MAX_MS)).toBe(false);
    expect(ticketBlocks(ticket(), ME, T0 + 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("treats a ticket with no usable timestamp as stale rather than blocking forever", () => {
    expect(ticketBlocks(ticket({ createdAtClientMs: 0 }), ME, T0)).toBe(false);
    expect(ticketBlocks(ticket({ createdAtClientMs: undefined }), ME, T0)).toBe(false);
    expect(ticketBlocks(ticket({ createdAtClientMs: "junk" }), ME, T0)).toBe(false);
  });
});

describe("ticketServedAtMs", () => {
  it("reports when this guest's refill actually reached the table", () => {
    const t = ticket({ status: "served", servedAtClientMs: T0 + 90_000 });
    expect(ticketServedAtMs(t, ME)).toBe(T0 + 90_000);
  });

  it("counts a partial serve — some of it did arrive", () => {
    const t = ticket({ status: "partially_served", servedAtClientMs: T0 + 30_000 });
    expect(ticketServedAtMs(t, ME)).toBe(T0 + 30_000);
  });

  it("gives a cancelled ticket no serve stamp — nothing arrived", () => {
    // POS writes cancelledAtClientMs on this path, never servedAtClientMs, so a
    // cancel must not start the diner's minute.
    const t = ticket({ status: "cancelled", cancelledAtClientMs: T0 + 20_000 });
    expect(ticketServedAtMs(t, ME)).toBe(0);
  });

  it("is per phone and refills only, like the block itself", () => {
    const served = { status: "served", servedAtClientMs: T0 + 10_000 };
    expect(ticketServedAtMs(ticket({ ...served, createdByParticipantId: "other" }), ME)).toBe(0);
    expect(ticketServedAtMs(ticket({ ...served, type: "addon" }), ME)).toBe(0);
  });

  it("ignores a missing or garbage stamp", () => {
    expect(ticketServedAtMs(ticket({ status: "served" }), ME)).toBe(0);
    expect(ticketServedAtMs(ticket({ status: "served", servedAtClientMs: "junk" }), ME)).toBe(0);
    expect(ticketServedAtMs(ticket({ status: "served", servedAtClientMs: 0 }), ME)).toBe(0);
  });

  it("is not capped by the 10-minute valve", () => {
    // That cap releases a ticket the kitchen never closed. A serve that really
    // happened is a fact, and the minute after it runs regardless of how long
    // the kitchen took to get there.
    const late = T0 + OUTSTANDING_BLOCK_MAX_MS + 60_000;
    expect(ticketServedAtMs(ticket({ status: "served", servedAtClientMs: late }), ME)).toBe(late);
  });
});

describe("servedStampsFrom", () => {
  it("stamps every refill the ticket covered, bundles included", () => {
    const bundle = ticket({
      itemId: "OTHER_REFILLS",
      refillIds: ["rice", "kimchi"],
      status: "served",
      servedAtClientMs: T0 + 45_000,
    });
    expect(servedStampsFrom([bundle], ME)).toEqual({
      OTHER_REFILLS: T0 + 45_000,
      rice: T0 + 45_000,
      kimchi: T0 + 45_000,
    });
  });

  it("keeps the most recent serve when a refill was ordered twice", () => {
    const first = ticket({ status: "served", servedAtClientMs: T0 + 10_000 });
    const second = ticket({ status: "served", servedAtClientMs: T0 + 90_000 });
    expect(servedStampsFrom([first, second], ME)).toEqual({ pork: T0 + 90_000 });
    // Order of the scan must not matter.
    expect(servedStampsFrom([second, first], ME)).toEqual({ pork: T0 + 90_000 });
  });

  it("skips tickets that never arrived", () => {
    const open = ticket({ status: "preparing" });
    const cancelled = ticket({ itemId: "beef", status: "cancelled" });
    expect(servedStampsFrom([open, cancelled], ME)).toEqual({});
  });
});

describe("ticketIsPendingFirstServing", () => {
  // Not this phone's ticket and not a refill: the cashier writes it at check-in,
  // so it carries no createdByParticipantId this diner would match.
  const pkg = (over: Record<string, any> = {}): Record<string, any> => ({
    type: "package",
    status: "preparing",
    createdAtClientMs: T0,
    itemName: "Unli Set A",
    ...over,
  });

  it("blocks while the cashier's opening order is still with the kitchen", () => {
    expect(ticketIsPendingFirstServing(pkg(), T0 + 5_000)).toBe(true);
    expect(ticketIsPendingFirstServing(pkg({ status: "partially_served" }), T0 + 5_000)).toBe(true);
    expect(ticketIsPendingFirstServing(pkg({ status: "ready" }), T0 + 5_000)).toBe(true);
  });

  it("does not care who created it — it is the table's order, not a diner's", () => {
    expect(ticketIsPendingFirstServing(pkg({ createdByParticipantId: "anyone" }), T0 + 5_000)).toBe(true);
  });

  it("stops blocking once served or cancelled", () => {
    expect(ticketIsPendingFirstServing(pkg({ status: "served" }), T0 + 5_000)).toBe(false);
    expect(ticketIsPendingFirstServing(pkg({ status: "cancelled" }), T0 + 5_000)).toBe(false);
  });

  it("ignores refills and add-ons — only the opening package gates", () => {
    expect(ticketIsPendingFirstServing(pkg({ type: "refill" }), T0 + 5_000)).toBe(false);
    expect(ticketIsPendingFirstServing(pkg({ type: "addon" }), T0 + 5_000)).toBe(false);
  });

  it("releases the table once the valve expires", () => {
    expect(ticketIsPendingFirstServing(pkg(), T0 + FIRST_SERVING_BLOCK_MAX_MS - 1)).toBe(true);
    expect(ticketIsPendingFirstServing(pkg(), T0 + FIRST_SERVING_BLOCK_MAX_MS)).toBe(false);
  });

  it("never blocks on a ticket with no usable timestamp", () => {
    expect(ticketIsPendingFirstServing(pkg({ createdAtClientMs: 0 }), T0)).toBe(false);
    expect(ticketIsPendingFirstServing(pkg({ createdAtClientMs: "junk" }), T0)).toBe(false);
    expect(ticketIsPendingFirstServing({}, T0)).toBe(false);
  });

  it("agrees with the client predicate on the same facts", () => {
    // The UI refuses to open the modal and the API refuses the order; if these
    // two ever disagreed, one of them would be lying to the diner.
    const asOrder = {
      id: "t", itemId: "", itemName: "Unli Set A", qty: 1, qtyServed: 0,
      status: "preparing" as const, type: "package", createdAtMs: T0,
      note: null, detail: null, orderedBySlot: null, orderedByMe: false,
      lineTotal: null, billed: false,
    };
    for (const at of [T0 + 1, T0 + FIRST_SERVING_BLOCK_MAX_MS - 1, T0 + FIRST_SERVING_BLOCK_MAX_MS]) {
      expect(ticketIsPendingFirstServing(pkg(), at)).toBe(hasPendingFirstServing([asOrder], at));
    }
  });
});
