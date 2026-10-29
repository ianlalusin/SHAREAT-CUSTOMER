/**
 * Flight paths for fly-by characters — pure functions of progress.
 *
 * Each path maps p (0 → 1) to a point on screen, entering and leaving off the
 * edges. All are drawn left-to-right; `mirror` flips one to fly right-to-left,
 * so every shape works from either side. The art faces right, and the caller
 * mirrors it whenever the path is heading left — which is what makes the
 * boomerang look like it turned around rather than reversed.
 */

export type Pt = { x: number; y: number };
/** `m` is the off-screen margin: the sprite's width, so it fully enters and leaves. */
type Path = (p: number, w: number, h: number, m: number) => Pt;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

export const FLIGHTS: Record<string, { path: Path; ms: number }> = {
  straight: {
    ms: 2400,
    path: (p, w, h, m) => ({ x: lerp(-m, w + m, p), y: h * 0.32 }),
  },
  diagonalDown: {
    ms: 2600,
    path: (p, w, h, m) => ({ x: lerp(-m, w + m, p), y: lerp(h * 0.12, h * 0.78, p) }),
  },
  diagonalUp: {
    ms: 2600,
    path: (p, w, h, m) => ({ x: lerp(-m, w + m, p), y: lerp(h * 0.8, h * 0.1, p) }),
  },
  wave: {
    ms: 3200,
    path: (p, w, h, m) => ({ x: lerp(-m, w + m, p), y: h * 0.45 + Math.sin(p * Math.PI * 3) * h * 0.14 }),
  },
  /** Flies in flat, does a full loop-the-loop mid-screen, flies out. */
  loop: {
    ms: 4200,
    path: (p, w, h, m) => {
      const cx = w * 0.5;
      const cy = h * 0.42;
      const r = Math.min(w, h) * 0.24;
      if (p < 0.3) return { x: lerp(-m, cx, p / 0.3), y: cy + r };
      if (p < 0.7) {
        // Counter-clockwise from the bottom of the circle, so it climbs as it goes forward.
        const a = Math.PI / 2 - ((p - 0.3) / 0.4) * Math.PI * 2;
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
      }
      return { x: lerp(cx, w + m, (p - 0.7) / 0.3), y: cy + r };
    },
  },
  /** Swoops in on a diagonal, turns around, goes back out flat the way it came. */
  boomerang: {
    ms: 3800,
    path: (p, w, h, m) => {
      const tx = w * 0.72;
      const ty = h * 0.6;
      if (p < 0.45) {
        const t = ease(p / 0.45);
        return { x: lerp(-m, tx, t), y: lerp(h * 0.1, ty, t) };
      }
      if (p < 0.6) {
        // The turn: a small half-circle so it reads as a U-turn, not a bounce.
        const a = -Math.PI / 2 + ((p - 0.45) / 0.15) * Math.PI;
        return { x: tx + Math.cos(a) * 40, y: ty + 40 + Math.sin(a) * 40 };
      }
      const t = (p - 0.6) / 0.4;
      return { x: lerp(tx, -m, t), y: ty + 80 };
    },
  },
  /** Down a diagonal, then back up another — a V across the screen. */
  zigzag: {
    ms: 3000,
    path: (p, w, h, m) => {
      const x = lerp(-m, w + m, p);
      const y = p < 0.5 ? lerp(h * 0.15, h * 0.7, p / 0.5) : lerp(h * 0.7, h * 0.2, (p - 0.5) / 0.5);
      return { x, y };
    },
  },
};

export const FLIGHT_NAMES = Object.keys(FLIGHTS);

export type Flight = { name: string; mirror: boolean; ms: number };

export function randomFlight(): Flight {
  const name = FLIGHT_NAMES[Math.floor(Math.random() * FLIGHT_NAMES.length)];
  return { name, mirror: Math.random() < 0.5, ms: FLIGHTS[name].ms };
}

/**
 * Where the flyer is at progress p, which way it faces, and how much to tilt
 * into the turn. Facing comes from where it is heading next, not a fixed
 * direction, so a boomerang turns its nose round on the way back.
 */
export function flightPose(f: Flight, p: number, w: number, h: number, m: number) {
  const fn = FLIGHTS[f.name]?.path ?? FLIGHTS.straight.path;
  const at = (q: number) => {
    const pt = fn(Math.min(1, Math.max(0, q)), w, h, m);
    return f.mirror ? { x: w - pt.x, y: pt.y } : pt;
  };
  const a = at(p);
  const b = at(p + 0.015);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const facingLeft = dx < -0.01;
  // Tilt toward the direction of travel, capped so a loop does not go upside down.
  const raw = (Math.atan2(dy, Math.abs(dx) || 0.0001) * 180) / Math.PI;
  const tilt = Math.max(-30, Math.min(30, raw)) * (facingLeft ? -1 : 1);
  return { x: a.x, y: a.y, facingLeft, tilt };
}
