import { describe, it, expect } from "vitest";
import { adType, checkAdFile, wouldExceedBranchLimit, MAX_VIDEO_SECONDS } from "./tv-ads";

const MB = 1024 * 1024;

describe("tv ads upload checks", () => {
  it("classifies files", () => {
    expect(adType("image/jpeg")).toBe("image");
    expect(adType("image/webp")).toBe("image");
    expect(adType("image/gif")).toBe("gif");
    expect(adType("video/mp4")).toBe("video");
    expect(adType("video/quicktime")).toBeNull();
    expect(adType("application/pdf")).toBeNull();
  });

  it("enforces size and length limits", () => {
    expect(checkAdFile("image/png", 9 * MB)).toBeNull();
    expect(checkAdFile("image/png", 11 * MB)).toMatch(/10 MB/);
    expect(checkAdFile("image/gif", 11 * MB)).toMatch(/10 MB/);
    expect(checkAdFile("video/mp4", 49 * MB, 60)).toBeNull();
    expect(checkAdFile("video/mp4", 51 * MB, 30)).toMatch(/50 MB/);
    expect(checkAdFile("video/mp4", 10 * MB, MAX_VIDEO_SECONDS + 1)).toMatch(/60 seconds/);
    expect(checkAdFile("video/mov", 1 * MB)).toMatch(/MP4/);
  });

  it("caps active ads per branch at 30", () => {
    const ads = Array.from({ length: 30 }, () => ({ active: true, storeIds: ["lipa"] as string[] | "all" }));
    expect(wouldExceedBranchLimit(ads, ["malvar"], ["lipa", "malvar"])).toBeNull();
    expect(wouldExceedBranchLimit(ads, ["lipa"], ["lipa", "malvar"])).toBe("lipa");
    expect(wouldExceedBranchLimit(ads, "all", ["lipa", "malvar"])).toBe("lipa");
    expect(wouldExceedBranchLimit(ads.map((a) => ({ ...a, active: false })), ["lipa"], ["lipa"])).toBeNull();
  });
});
