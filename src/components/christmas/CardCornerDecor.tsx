import { ParolStar } from "./ParolStar";
import { PineSprigCorner } from "./PineSprigCorner";
import { MiniChristmasTree } from "./MiniChristmasTree";
import { OrnamentDuo } from "./OrnamentDuo";
import { SantaFace } from "./SantaFace";
import { ReindeerFace } from "./ReindeerFace";

const ELEMENTS = [ParolStar, PineSprigCorner, MiniChristmasTree, OrnamentDuo, SantaFace, ReindeerFace];

/** Same string always maps to the same element — varied across cards, stable per card (no flicker on re-render). */
function pick(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ELEMENTS[hash % ELEMENTS.length];
}

/**
 * Drops one of the six Christmas elements (parol, pine sprig, tree, ornaments,
 * Santa, reindeer) into a card corner, picked deterministically from `seed`
 * (e.g. the item name or order id) so a grid of cards shows real variety
 * instead of the same icon repeated everywhere.
 */
export function CardCornerDecor({ seed, className = "" }: { seed: string; className?: string }) {
  const Element = pick(seed);
  return <Element className={`christmas-corner-decor ${className}`} />;
}
