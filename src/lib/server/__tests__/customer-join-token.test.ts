import { describe, it, expect } from "vitest";

process.env.CUSTOMER_JOIN_TOKEN_SECRET = "test-secret-for-unit-tests-only-32chars";

const { signJoinToken, verifyJoinToken } = await import("../customer-join-token");

const validPayload = {
  storeId: "store1",
  sessionId: "sess1",
  pin: "ABC123",
  joinVersion: 1,
  exp: Date.now() + 60_000,
};

describe("signJoinToken / verifyJoinToken", () => {
  it("round-trips a valid payload", () => {
    const token = signJoinToken(validPayload);
    const decoded = verifyJoinToken(token);
    expect(decoded.storeId).toBe("store1");
    expect(decoded.pin).toBe("ABC123");
  });

  it("rejects a tampered token", () => {
    const token = signJoinToken(validPayload);
    expect(() => verifyJoinToken(token + "x")).toThrow("Invalid join token signature.");
  });

  it("rejects an expired token", () => {
    const expired = signJoinToken({ ...validPayload, exp: Date.now() - 1 });
    expect(() => verifyJoinToken(expired)).toThrow("Join token expired.");
  });
});
