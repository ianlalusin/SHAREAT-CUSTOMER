import type { ReactNode } from "react";

/**
 * The games section shell.
 *
 * The app has no layout below root — every page re-implements its own header —
 * so this is where that stops for the shelf rather than repeating a back bar in
 * each game.
 */
export default function PlayLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-zinc-50">{children}</div>;
}
