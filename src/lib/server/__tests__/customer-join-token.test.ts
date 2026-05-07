import { describe, it, expect } from "vitest";

process.env.CUSTOMER_JOIN_TOKEN_SECRET = "test-secret-for-unit-tests-only-32chars";

const { signJoinToken, verifyJoinToken } = await import("../customer-join-token");

const validPayload = {
  s: "store1",
  i: "sess1",
  p: "ABC123",
  v: 1,
  e: Math.floor((Date.now() + 60_000) / 1000),
};

describe("signJoinToken / verifyJoinToken", () => {
  it("round-trips a valid payload", () => {
    const token = signJoinToken(validPayload);
    const decoded = verifyJoinToken(token);
    expect(decoded.s).toBe("store1");
    expect(decoded.p).toBe("ABC123");
  });

  it("rejects a tampered token", () => {
    const token = signJoinToken(validPayload);
    expect(() => verifyJoinToken(token + "x")).toThrow("Invalid join token signature.");
  });

  it("rejects an expired token", () => {
    const expired = signJoinToken({ ...validPayload, e: Math.floor(Date.now() / 1000) - 1 });
    expect(() => verifyJoinToken(expired)).toThrow("Join token expired.");
  });
});
