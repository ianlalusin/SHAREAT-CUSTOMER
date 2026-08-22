"use client";

import { useRouter } from "next/navigation";
import { Flame, Gamepad2, type LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

/**
 * Icons cannot cross the API boundary as components, so the route sends a name
 * and the tile resolves it. An unknown name falls back rather than crashing the
 * hub — a game added to the registry ahead of an icon should still render.
 */
const ICONS: Record<string, LucideIcon> = { Flame, Gamepad2 };

export type GameTileData = {
  id: string;
  title: string;
  tagline: string;
  accent: string;
  href: string;
  iconName: string;
};

export function GameTile({ game }: { game: GameTileData }) {
  const router = useRouter();
  const Icon = ICONS[game.iconName] ?? Gamepad2;

  return (
    <button
      type="button"
      onClick={() => router.push(game.href)}
      className="w-full text-left rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md active:scale-[0.99] transition flex items-center gap-4"
    >
      <span className={`h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br ${game.accent} flex items-center justify-center`}>
        <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-black leading-tight">{game.title}</span>
        <span className="block text-sm text-muted-foreground line-clamp-2">{game.tagline}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
    </button>
  );
}
