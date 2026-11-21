import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ getAdminBucket: () => null }));
vi.mock("@/lib/server/games/config", () => ({ readGameConfigs: async () => ({}) }));

import { MAX_BYTES, validateUpload } from "./capture-share-store";

const jpeg = (n: number) => {
  const b = new Uint8Array(n);
  b.set([0xff, 0xd8, 0xff]);
  return b;
};

describe("validateUpload", () => {
  it("accepts a normal JPEG", () => {
    expect(validateUpload(jpeg(200_000), "1732170000000-abc123")).toBeNull();
  });
  it("rejects non-JPEG, empty, oversized and bad ids", () => {
    const png = new Uint8Array(5000);
    png.set([0x89, 0x50, 0x4e]);
    expect(validateUpload(png, "abcdef")).toMatch(/JPEG/);
    expect(validateUpload(jpeg(100), "abcdef")).toMatch(/empty/);
    expect(validateUpload(jpeg(MAX_BYTES + 1), "abcdef")).toMatch(/large/);
    expect(validateUpload(jpeg(5000), "../x")).toMatch(/id/);
  });
});
