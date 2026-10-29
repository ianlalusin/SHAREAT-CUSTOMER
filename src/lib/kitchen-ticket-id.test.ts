import { describe, expect, it } from "vitest";
import { deriveKitchenTicketId, normalizeRequestId, type KitchenTicketIdParts } from "./kitchen-ticket-id";

const base: KitchenTicketIdParts = {
  kind: "addon",
  storeId: "store1",
  sessionId: "sess1",
  participantId: "p1",
  requestId: "3f1c2a9e-0b7d-4e6a-9c1f-2d3e4f5a6b7c",
  lineIndex: 0,
  lineKey: "item1|2",
};

describe("deriveKitchenTicketId", () => {
  it("is stable for the same inputs, so a retry hits the same ticket", () => {
    expect(deriveKitchenTicketId(base)).toBe(deriveKitchenTicketId({ ...base }));
  });

  it("is a 32-char hex id usable as a Firestore doc id", () => {
    expect(deriveKitchenTicketId(base)).toMatch(/^[0-9a-f]{32}$/);
  });

  it.each<[string, Partial<KitchenTicketIdParts>]>([
    ["kind", { kind: "refill" }],
    ["store", { storeId: "store2" }],
    ["session", { sessionId: "sess2" }],
    ["participant", { participantId: "p2" }],
    ["request", { requestId: "another-request-id" }],
    ["line index", { lineIndex: 1 }],
    ["line content", { lineKey: "item1|3" }],
  ])("changes when the %s changes", (_label, change) => {
    expect(deriveKitchenTicketId({ ...base, ...change })).not.toBe(deriveKitchenTicketId(base));
  });

  it("cannot be collided by shifting text between fields", () => {
    const a = deriveKitchenTicketId({ ...base, storeId: "ab", sessionId: "c" });
    const b = deriveKitchenTicketId({ ...base, storeId: "a", sessionId: "bc" });
    expect(a).not.toBe(b);
  });
});

describe("normalizeRequestId", () => {
  it("accepts a UUID", () => {
    expect(normalizeRequestId("3f1c2a9e-0b7d-4e6a-9c1f-2d3e4f5a6b7c")).toBe(
      "3f1c2a9e-0b7d-4e6a-9c1f-2d3e4f5a6b7c"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeRequestId("  abcdefgh12  ")).toBe("abcdefgh12");
  });

  it.each([undefined, null, 42, {}, "", "short", "has space inside", "a/b/c/d/e/f", "x".repeat(129)])(
    "treats %j as absent",
    (raw) => {
      expect(normalizeRequestId(raw)).toBeNull();
    }
  );
});
