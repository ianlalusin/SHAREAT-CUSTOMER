import { describe, it, expect } from "vitest";
import { hashDeviceId } from "../customer-participants";

describe("hashDeviceId", () => {
  it("returns a 16-char hex string", () => {
    expect(hashDeviceId("test-device-abc")).toHaveLength(16);
    expect(hashDeviceId("test-device-abc")).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashDeviceId("device-x")).toBe(hashDeviceId("device-x"));
  });

  it("differs for different device IDs", () => {
    expect(hashDeviceId("device-a")).not.toBe(hashDeviceId("device-b"));
  });
});
