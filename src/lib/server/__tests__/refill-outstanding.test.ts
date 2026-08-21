import { describe, it, expect } from "vitest";
import { refillIdsOnTicket, ticketBlocks } from "@/lib/server/refill-outstanding";
import { OUTSTANDING_BLOCK_MAX_MS } from "@/lib/refill-cooldown";

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
