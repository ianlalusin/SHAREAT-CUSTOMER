import { describe, it, expect, afterEach } from "vitest";
import { birthdayError } from "../signup-fields";
import { maskDisplayName } from "../mask-name";

// 2026-10-29 12:00 UTC (20:00 in Manila)
const NOW = Date.UTC(2026, 9, 29, 12);
const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe("birthdayError", () => {
  it("accepts a valid date on a Manila-time server (the old check rejected it)", () => {
    process.env.TZ = "Asia/Manila";
    expect(birthdayError("2000-05-15", NOW)).toBeNull();
  });

  it("accepts a valid date on a UTC and a US-time server", () => {
    process.env.TZ = "UTC";
    expect(birthdayError("2000-05-15", NOW)).toBeNull();
    process.env.TZ = "America/Los_Angeles";
    expect(birthdayError("2000-05-15", NOW)).toBeNull();
  });

  it("accepts Feb 29 only in leap years", () => {
    expect(birthdayError("2000-02-29", NOW)).toBeNull();
    expect(birthdayError("2001-02-29", NOW)).toBe("Invalid date.");
  });

  it("rejects impossible dates and bad formats", () => {
    expect(birthdayError("2000-13-01", NOW)).toBe("Invalid date.");
    expect(birthdayError("2000-04-31", NOW)).toBe("Invalid date.");
    expect(birthdayError("2000-00-10", NOW)).toBe("Invalid date.");
    expect(birthdayError("2000-5-15", NOW)).toBe("Birthday must be YYYY-MM-DD.");
    expect(birthdayError("", NOW)).toBe("Birthday must be YYYY-MM-DD.");
  });

  it("rejects future dates by the Manila calendar, and pre-1900", () => {
    expect(birthdayError("2026-10-29", NOW)).toBeNull();
    // Already Oct 30 in Manila at 16:30 UTC on Oct 29.
    expect(birthdayError("2026-10-30", Date.UTC(2026, 9, 29, 16, 30))).toBeNull();
    expect(birthdayError("2026-10-30", NOW)).toBe("Invalid date.");
    expect(birthdayError("1899-12-31", NOW)).toBe("Invalid date.");
  });
});

describe("maskDisplayName", () => {
  it("keeps the first name and the last name's initial", () => {
    expect(maskDisplayName("Ana Dela Cruz")).toBe("Ana C.");
    expect(maskDisplayName("  ben   santos ")).toBe("ben S.");
  });
  it("leaves a single name and empty input alone", () => {
    expect(maskDisplayName("Ana")).toBe("Ana");
    expect(maskDisplayName("")).toBe("");
  });
});
