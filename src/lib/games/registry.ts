import type { LucideIcon } from "lucide-react";
import { Flame, Utensils } from "lucide-react";

/**
 * The mini-games shelf.
 *
 * Two halves, deliberately split: CODE owns what a game is (this file), and
 * FIRESTORE owns whether it is running (`miniGames/{id}`, judged by
 * `lib/games/gameScope.ts`). So switching a game on for a season, swapping it
 * for another, or pulling it is a config change with no deploy — and adding one
 * is a folder under app/play plus an entry here.
 *
 * A game listed here is NOT live until its config doc exists and says so. There
 * is no "default on".
 */
export type GameAccent = "flame" | "berry" | "ocean" | "ember";

export type GameDefinition = {
  /** Stable. Doubles as the `miniGames/{id}` key — never rename a shipped id. */
  id: string;
  title: string;
  tagline: string;
  icon: LucideIcon;
  /**
   * Semantic accent key, NOT Tailwind classes.
   *
   * Tailwind only scans src/pages, src/components and src/app — a class written
   * here is never generated, so the tile rendered with a transparent badge and
   * a white-on-white icon. Presentation lives in GameTile, where Tailwind can
   * see it.
   */
  accent: GameAccent;
  href: string;
  /**
   * Whether PLAYING needs an active table session. Browsing never does — the
   * hub is readable away from the restaurant, which is most of the point of
   * having content worth coming back to.
   */
  requiresSession: boolean;
};

export const GAMES: GameDefinition[] = [
  {
    id: "samgyup-recipe",
    title: "Paano Ka Mag-Samgyup?",
    tagline: "Share your way of eating samgyup. Let others try it and rate it.",
    icon: Flame,
    accent: "flame",
    href: "/play/samgyup-recipe",
    requiresSession: true,
  },
  {
    id: "flipit",
    title: "Flip It",
    tagline: "Grill five strips. Press when the heat hits green.",
    icon: Utensils,
    accent: "ember",
    href: "/play/flipit",
    // Nothing is written and nothing is published, so this one plays anywhere.
    requiresSession: false,
  },
];

export function getGame(id: string): GameDefinition | null {
  return GAMES.find((g) => g.id === id) ?? null;
}
