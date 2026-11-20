/**
 * Upload checks for /admin/tv-ads. Mirrors POS storage.rules (tvAds/) and the
 * TV endpoint's 30-ad cap, so an admin hears "too big" before the upload, not a
 * silent permission error after it.
 */

export type TvAdType = "image" | "gif" | "video";

export type TvAd = {
  id: string;
  storagePath: string;
  url: string;
  type: TvAdType;
  bytes: number;
  durationSec: number | null;
  storeIds: string[] | "all";
  active: boolean;
  createdAt: number;
  createdBy: string;
};

export const MAX_STILL_MB = 10;
export const MAX_VIDEO_MB = 50;
export const MAX_VIDEO_SECONDS = 60;
export const MAX_ADS_PER_BRANCH = 30;

const MB = 1024 * 1024;

export function adType(contentType: string): TvAdType | null {
  if (contentType === "image/gif") return "gif";
  if (contentType === "video/mp4") return "video";
  if (contentType.startsWith("image/")) return "image";
  return null;
}

/** null = fine, else the message to show. */
export function checkAdFile(contentType: string, bytes: number, durationSec?: number): string | null {
  const type = adType(contentType);
  if (!type) return "Use a picture, a GIF, or an MP4 video.";
  if (type !== "video" && bytes >= MAX_STILL_MB * MB) return `Pictures and GIFs must be under ${MAX_STILL_MB} MB.`;
  if (type === "video" && bytes >= MAX_VIDEO_MB * MB) return `Videos must be under ${MAX_VIDEO_MB} MB.`;
  if (type === "video" && (durationSec ?? 0) > MAX_VIDEO_SECONDS) return `Videos must be ${MAX_VIDEO_SECONDS} seconds or shorter.`;
  return null;
}

/** The first branch that already has 30 active ads, or null. */
export function wouldExceedBranchLimit(
  ads: Array<Pick<TvAd, "active" | "storeIds">>,
  target: string[] | "all",
  allStoreIds: string[],
): string | null {
  const branches = target === "all" ? allStoreIds : target;
  for (const id of branches) {
    const count = ads.filter((a) => a.active && (a.storeIds === "all" || a.storeIds.includes(id))).length;
    if (count >= MAX_ADS_PER_BRANCH) return id;
  }
  return null;
}
