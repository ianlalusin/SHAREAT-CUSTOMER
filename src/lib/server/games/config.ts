import type { Firestore } from "firebase-admin/firestore";
import { GAMES, type GameDefinition } from "@/lib/games/registry";
import { isGameEnabledForStore, isGameConfigured, type GameStoreScope } from "@/lib/games/gameScope";

/** Firestore half of the shelf: which registered games are actually running. */
const CONFIGS = "miniGames";

export type GameConfigDoc = GameStoreScope & { sortOrder?: number; updatedAtMs?: number };

export async function readGameConfigs(db: Firestore): Promise<Record<string, GameConfigDoc>> {
  const snap = await db.collection(CONFIGS).get();
  const out: Record<string, GameConfigDoc> = {};
  for (const d of snap.docs) out[d.id] = d.data() as GameConfigDoc;
  return out;
}

/** The shelf payload. `metrics` stays server-side: a diner has no use for it,
 *  and it is the admin chart that needs the definitions. */
export type ListedGame = Omit<GameDefinition, "icon" | "metrics"> & { iconName: string; sortOrder: number };

/**
 * The games a caller may see.
 *
 * A registry entry with NO config doc is off. `isGameEnabledForStore({})` is
 * true — it mirrors the reward-scope semantics on purpose — so the "must be
 * switched on deliberately" rule has to be applied here, by the caller, and not
 * inside that function.
 */
export function selectEnabledGames(
  configs: Record<string, GameConfigDoc>,
  storeId: string | null
): ListedGame[] {
  return GAMES.filter((g) => {
    const cfg = configs[g.id];
    return isGameConfigured(cfg) && isGameEnabledForStore(cfg, storeId);
  })
    .map((g) => ({
      id: g.id,
      title: g.title,
      tagline: g.tagline,
      accent: g.accent,
      href: g.href,
      requiresSession: g.requiresSession,
      iconName: g.icon.displayName || g.id,
      sortOrder: Number(configs[g.id]?.sortOrder || 0),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}
