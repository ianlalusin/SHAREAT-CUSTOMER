import { describe, it, expect } from "vitest";
import { applyHit, clientIp, retryAfterMs, type RateRule } from "../rate-limit";

const rule: RateRule = { bucket: "t", limit: 3, windowMs: 1000 };

describe("applyHit", () => {
  it("opens a window on the first hit", () => {
    expect(applyHit(null, rule, 500)).toEqual({ allowed: true, retryAfterMs: 0, next: { count: 1, windowStartMs: 500 } });
  });

  it("allows up to the limit, then refuses without counting", () => {
    let s = applyHit(null, rule, 0).next;
    s = applyHit(s, rule, 10).next;
    s = applyHit(s, rule, 20).next;
    expect(s).toEqual({ count: 3, windowStartMs: 0 });
    const refused = applyHit(s, rule, 30);
    expect(refused.allowed).toBe(false);
    expect(refused.next).toBeNull();
    expect(refused.retryAfterMs).toBe(970);
  });

  it("starts a fresh window once the old one ends", () => {
    const full = { count: 3, windowStartMs: 0 };
    expect(applyHit(full, rule, 1000)).toEqual({ allowed: true, retryAfterMs: 0, next: { count: 1, windowStartMs: 1000 } });
  });
});

describe("retryAfterMs", () => {
  it("is 0 below the limit and for missing state", () => {
    expect(retryAfterMs(null, rule, 0)).toBe(0);
    expect(retryAfterMs({ count: 2, windowStartMs: 0 }, rule, 10)).toBe(0);
  });

  it("is the time left in a full window", () => {
    expect(retryAfterMs({ count: 3, windowStartMs: 0 }, rule, 400)).toBe(600);
    expect(retryAfterMs({ count: 3, windowStartMs: 0 }, rule, 1000)).toBe(0);
  });
});

describe("clientIp", () => {
  const r = (h: Record<string, string>) => new Request("http://x", { headers: h });
  it("takes the first x-forwarded-for hop", () => {
    expect(clientIp(r({ "x-forwarded-for": " 1.2.3.4 , 10.0.0.1" }))).toBe("1.2.3.4");
  });
  it("falls back to unknown", () => {
    expect(clientIp(r({}))).toBe("unknown");
  });
});
