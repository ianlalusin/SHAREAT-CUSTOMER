import { isWithinRunDates } from "@/lib/games/gameScope";
import { DEFAULT_SETTINGS, normalizeSettings, settingsForBranch, type GhostHuntSettings } from "./rules";

/**
 * Ghost Hunt settings live PER BRANCH, and only per branch.
 *
 * Each `ghostHuntBranches/{storeId}` carries its own complete settings —
 * on/off, theme, dates, hours, prizes, odds, socials. There are no chain-wide
 * settings to fall back on: two layers ("general" plus "this branch's own")
 * made it unclear which value a branch was actually running on.
 *
 * `miniGames/ghost-hunt` stays, but only as a summary the shared games shelf
 * reads (is it on anywhere, at which branches, between which dates). It is
 * recomputed from the branches on every save and never edited by hand.
 *
 * SWITCH-OVER. Before this, the hunt ran on chain settings (`event` on the
 * summary doc) plus optional branch `overrides`. Until the first per-branch
 * save, a branch is read exactly as it ran then (`legacyBranchConfig`), so the
 * live hunt does not change under anyone's feet; the first save copies every
 * branch's current setup onto its own doc (`perStore: true` marks that done).
 */

export type BranchConfig = { enabled: boolean; settings: GhostHuntSettings };

/** How a branch ran under the old chain-plus-overrides model. */
export function legacyBranchConfig(
  summary: Record<string, any> | null | undefined,
  overrides: unknown,
  storeId: string
): BranchConfig {
  const settings = settingsForBranch(normalizeSettings(summary?.event), overrides);
  if (!summary || summary.isActive === false) return { enabled: false, settings };
  const allowed = Array.isArray(summary.applicableStoreIds) ? summary.applicableStoreIds : [];
  return { enabled: allowed.length === 0 || allowed.includes(storeId), settings };
}

/** The settings a branch runs on right now. */
export function resolveBranchConfig(
  summary: Record<string, any> | null | undefined,
  branch: Record<string, any> | null | undefined,
  storeId: string
): BranchConfig {
  if (branch?.settings) return { enabled: branch.enabled === true, settings: normalizeSettings(branch.settings) };
  // Switched over, and this branch never set up: off, on default settings.
  if (summary?.perStore === true) return { enabled: false, settings: DEFAULT_SETTINGS };
  return legacyBranchConfig(summary, branch?.overrides, storeId);
}

export type HuntSummary = {
  isActive: boolean;
  applicableStoreIds: string[];
  startsAtMs: number | null;
  endsAtMs: number | null;
};

/**
 * What the games shelf needs, from every branch's own settings: on if any
 * branch is on, offered only at those branches, between the earliest start and
 * the latest end. A branch whose own dates have passed still says so on the
 * game screen itself; the shelf only needs to know the hunt exists somewhere.
 */
export function summarizeBranches(branches: Array<{ storeId: string } & BranchConfig>): HuntSummary {
  const on = branches.filter((b) => b.enabled);
  if (!on.length) return { isActive: false, applicableStoreIds: [], startsAtMs: null, endsAtMs: null };
  return {
    isActive: true,
    applicableStoreIds: on.map((b) => b.storeId).sort(),
    startsAtMs: Math.min(...on.map((b) => b.settings.startsAtMs)),
    endsAtMs: Math.max(...on.map((b) => b.settings.endsAtMs)),
  };
}

/** Whether the shelf summary says the hunt is on anywhere right now (anonymous browsing). */
export function summaryLive(summary: Record<string, any> | null | undefined, nowMs: number): boolean {
  return !!summary && summary.isActive !== false && isWithinRunDates(summary, nowMs);
}
