import type { LucideIcon } from "lucide-react";
import { Flame, Ghost, Utensils } from "lucide-react";
import type { GameMetricDefinitions } from "@/lib/games/metrics";

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
export type GameAccent = "flame" | "berry" | "ocean" | "ember" | "night";

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
  /**
   * What a view and a use MEAN for this game.
   *
   * Kept here so adding a game stays "a folder plus one entry", and so the
   * admin chart can print the definition beside the number — two games on one
   * axis are meaningless if nobody wrote down what each one counted.
   * The shared tracker enforces the threshold; the game only emits signals.
   */
  metrics: GameMetricDefinitions;
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
    metrics: {
      view: { label: "Opened a recipe" },
      // Rating IS the use — there is no round to finish, and a diner who reads
      // a recipe without judging it has not used the game, only looked at it.
      use: { label: "Rated a recipe", signal: "rating", threshold: 1 },
    },
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
    metrics: {
      view: { label: "Opened the game" },
      // A finished ROUND, not a press. Counting presses would make a five-press
      // game look five times more popular than a one-press one.
      use: { label: "Finished a round", signal: "flip", threshold: 5 },
    },
  },
  {
    id: "ghost-hunt",
    // Seasonal. The same game reruns for other occasions by switching the
    // event's `theme` in /admin/games/ghost-hunt — the title stays generic.
    title: "Spot a Ghost",
    tagline: "Point your camera around. Catch the right ghost, win a treat.",
    icon: Ghost,
    accent: "night",
    href: "/play/ghost-hunt",
    // The server decides who wins and checks the table; a prize needs a seat.
    requiresSession: true,
    metrics: {
      view: { label: "Opened the hunt" },
      use: { label: "Opened the camera", signal: "camera", threshold: 1 },
    },
  },
];

export function getGame(id: string): GameDefinition | null {
  return GAMES.find((g) => g.id === id) ?? null;
}

/** A game's metric definitions, or null when the id is not registered. */
export function getGameMetrics(id: string): GameMetricDefinitions | null {
  return getGame(id)?.metrics ?? null;
}
