import type { GhostTheme } from "@/lib/games/ghost-hunt/rules";

/**
 * Character packs — what the phone DRAWS. Swapping the event theme swaps the
 * pack; the server never sees any of this, it only says "prize ghost for
 * melona" and the phone decides it looks like a green ghost holding a Melona.
 *
 * Art is inline SVG strings, not React components, because the same picture
 * has to go two places: on screen as an <img>, and painted onto the photo the
 * diner shares. A data URL works for both.
 */

export type Character = {
  id: string;
  name: string;
  lines: string[];
  svg: string;
};

export type Pack = {
  theme: GhostTheme;
  label: string;
  noun: string;
  /** Prize characters keyed by prize id; anything else falls back by position. */
  prizeById: Record<string, Character>;
  prizeFallback: Character[];
  hello: Character[];
  flyby: Character[];
  bg: string;
};

export function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="400" height="440">${inner}</svg>`;

/* ---------- Halloween ---------- */

const GHOST_BODY =
  "M100 22C56 22 32 56 32 102V188Q46 174 59 188Q72 202 86 188Q100 174 114 188Q128 202 141 188Q154 174 168 188V102C168 56 144 22 100 22Z";

function ghost(body: string, extra = "", face = "") {
  return wrap(`
    <path d="${GHOST_BODY}" fill="${body}" stroke="#2a1a45" stroke-width="5" stroke-linejoin="round"/>
    ${
      face ||
      `<ellipse cx="80" cy="96" rx="9" ry="13" fill="#2a1a45"/>
       <ellipse cx="120" cy="96" rx="9" ry="13" fill="#2a1a45"/>
       <circle cx="83" cy="91" r="3" fill="#fff"/><circle cx="123" cy="91" r="3" fill="#fff"/>
       <path d="M90 124Q100 134 110 124" stroke="#2a1a45" stroke-width="5" fill="none" stroke-linecap="round"/>
       <circle cx="66" cy="116" r="8" fill="#ff8fb1" opacity=".7"/><circle cx="134" cy="116" r="8" fill="#ff8fb1" opacity=".7"/>`
    }
    ${extra}`);
}

const MELONA = ghost(
  "#d7f5c3",
  `<rect x="146" y="96" width="34" height="58" rx="13" fill="#8fd16a" stroke="#2a1a45" stroke-width="4"/>
   <rect x="152" y="104" width="8" height="40" rx="4" fill="#bdeb9d"/>
   <rect x="158" y="152" width="10" height="28" rx="4" fill="#e8c48a" stroke="#2a1a45" stroke-width="3"/>
   <text x="163" y="132" font-family="Arial Black,Arial" font-size="11" font-weight="900" fill="#2f6b1c" text-anchor="middle" transform="rotate(-90 163 128)">MELONA</text>`
);

const COKE = ghost(
  "#ffe3e3",
  `<path d="M156 78h14v12c8 8 10 18 10 30v52c0 6-4 10-10 10h-14c-6 0-10-4-10-10v-52c0-12 2-22 10-30z" fill="#e11d2e" stroke="#2a1a45" stroke-width="4"/>
   <rect x="154" y="72" width="18" height="8" rx="2" fill="#b91c1c" stroke="#2a1a45" stroke-width="3"/>
   <path d="M148 132q15-10 30 0" stroke="#fff" stroke-width="5" fill="none"/>
   <text x="163" y="156" font-family="Arial Black,Arial" font-size="10" fill="#fff" text-anchor="middle">1.5L</text>`
);

const KIMBAP = ghost(
  "#ffffff",
  `<circle cx="160" cy="132" r="26" fill="#1f2a1f" stroke="#2a1a45" stroke-width="4"/>
   <circle cx="160" cy="132" r="20" fill="#fffdf5"/>
   <rect x="150" y="122" width="7" height="7" rx="2" fill="#f59e0b"/>
   <rect x="161" y="121" width="8" height="6" rx="2" fill="#22c55e"/>
   <rect x="153" y="134" width="10" height="5" rx="2" fill="#facc15"/>
   <rect x="164" y="132" width="6" height="9" rx="2" fill="#ef4444"/>
   <circle cx="160" cy="132" r="3" fill="#a16207"/>`
);

const ENOKI = ghost(
  "#fff6e6",
  `<g stroke="#2a1a45" stroke-width="3">
     <path d="M150 168V108M158 168V100M166 168V104M174 168V112" stroke="#f5ecd7" stroke-width="5"/>
     <circle cx="150" cy="106" r="5" fill="#fffaf0"/><circle cx="158" cy="98" r="5" fill="#fffaf0"/>
     <circle cx="166" cy="102" r="5" fill="#fffaf0"/><circle cx="174" cy="110" r="5" fill="#fffaf0"/>
     <rect x="142" y="140" width="40" height="22" rx="6" fill="#b45309"/>
   </g>
   <path d="M146 150h32" stroke="#7c2d12" stroke-width="3"/>`
);

const BOO = ghost(
  "#f8f7ff",
  `<path d="M34 120q-22-6-26-30" stroke="#2a1a45" stroke-width="5" fill="none" stroke-linecap="round"/>
   <circle cx="8" cy="88" r="9" fill="#f8f7ff" stroke="#2a1a45" stroke-width="4"/>`
);

const WITCHY = ghost(
  "#efe4ff",
  `<path d="M58 44L100 3L142 44Z" fill="#4c1d95" stroke="#2a1a45" stroke-width="4"/>
   <ellipse cx="100" cy="46" rx="62" ry="10" fill="#5b21b6" stroke="#2a1a45" stroke-width="4"/>
   <rect x="80" y="30" width="40" height="8" fill="#f59e0b"/>`
);

const ZOOMIE = wrap(`
  <g opacity=".55" stroke="#93c5fd" stroke-width="6" stroke-linecap="round">
    <path d="M4 80h30M0 110h36M8 140h28"/>
  </g>
  <path d="${GHOST_BODY}" fill="#dbeafe" opacity=".85" stroke="#1e3a8a" stroke-width="5" transform="skewX(-14) translate(30 0)"/>
  <ellipse cx="118" cy="96" rx="8" ry="12" fill="#1e3a8a"/><ellipse cx="152" cy="96" rx="8" ry="12" fill="#1e3a8a"/>
  <path d="M120 126q14 10 28 0" stroke="#1e3a8a" stroke-width="5" fill="none" stroke-linecap="round"/>`);

const HALLOWEEN: Pack = {
  theme: "halloween",
  label: "Halloween",
  noun: "ghost",
  bg: "from-violet-950 via-zinc-900 to-black",
  prizeById: {
    melona: { id: "melona", name: "Melona Multo", lines: ["You caught me! Melona is yours!"], svg: MELONA },
    coke: { id: "coke", name: "Coca-Boo", lines: ["Fizz! A 1.5L Coke for your table!"], svg: COKE },
    kimbap: { id: "kimbap", name: "Kimbaboo", lines: ["Rolled up and caught! Kimbap on me."], svg: KIMBAP },
    enoki: { id: "enoki", name: "Enoki Wisp", lines: ["Spooky and crispy! Enoki rolls for you."], svg: ENOKI },
  },
  prizeFallback: [
    { id: "p1", name: "Melona Multo", lines: ["You caught me!"], svg: MELONA },
    { id: "p2", name: "Coca-Boo", lines: ["You caught me!"], svg: COKE },
  ],
  hello: [
    {
      id: "boo",
      name: "Boo",
      lines: ["Hi! Enjoy your samgyup!", "Boo! Did I scare you?", "I only came for the smell of grilled pork."],
      svg: BOO,
    },
    {
      id: "witchy",
      name: "Witchy",
      lines: ["Happy Halloween from SharEat!", "Keep looking… a prize ghost is near.", "Refill na!"],
      svg: WITCHY,
    },
  ],
  flyby: [{ id: "zoomie", name: "Zoomie", lines: ["Too fast! 💨"], svg: ZOOMIE }],
};

/* ---------- Christmas ---------- */

const SANTA = wrap(`
  <path d="M40 92Q100 -10 160 92Z" fill="#dc2626" stroke="#3b0d0d" stroke-width="5"/>
  <circle cx="160" cy="40" r="14" fill="#fff" stroke="#3b0d0d" stroke-width="4"/>
  <circle cx="100" cy="118" r="52" fill="#fcd9bd" stroke="#3b0d0d" stroke-width="5"/>
  <rect x="34" y="84" width="132" height="22" rx="11" fill="#fff" stroke="#3b0d0d" stroke-width="4"/>
  <path d="M50 130Q100 230 150 130Q130 150 100 146Q70 150 50 130Z" fill="#fff" stroke="#3b0d0d" stroke-width="4"/>
  <circle cx="82" cy="118" r="6" fill="#3b0d0d"/><circle cx="118" cy="118" r="6" fill="#3b0d0d"/>
  <circle cx="100" cy="134" r="9" fill="#f87171"/>`);

const RUDOLF = wrap(`
  <path d="M64 70C40 40 30 20 44 10M58 52C40 50 30 40 28 30M136 70C160 40 170 20 156 10M142 52C160 50 170 40 172 30" stroke="#7c4a1e" stroke-width="8" fill="none" stroke-linecap="round"/>
  <ellipse cx="100" cy="120" rx="56" ry="66" fill="#a16207" stroke="#3b1d0a" stroke-width="5"/>
  <ellipse cx="100" cy="150" rx="34" ry="26" fill="#e8c48a"/>
  <circle cx="80" cy="104" r="7" fill="#1c1917"/><circle cx="120" cy="104" r="7" fill="#1c1917"/>
  <circle cx="100" cy="140" r="16" fill="#ef4444" stroke="#7f1d1d" stroke-width="4"/>
  <circle cx="95" cy="135" r="4" fill="#fff" opacity=".8"/>`);

const SNOWMAN = wrap(`
  <circle cx="100" cy="160" r="50" fill="#fff" stroke="#1e3a8a" stroke-width="5"/>
  <circle cx="100" cy="78" r="38" fill="#fff" stroke="#1e3a8a" stroke-width="5"/>
  <rect x="68" y="104" width="64" height="14" rx="7" fill="#16a34a"/>
  <rect x="112" y="110" width="14" height="34" rx="6" fill="#16a34a"/>
  <circle cx="86" cy="72" r="5" fill="#1e293b"/><circle cx="114" cy="72" r="5" fill="#1e293b"/>
  <path d="M100 82l26 6-26 4z" fill="#f97316"/>
  <circle cx="100" cy="150" r="5" fill="#1e293b"/><circle cx="100" cy="172" r="5" fill="#1e293b"/>`);

const GINGER = wrap(`
  <path d="M100 30a30 30 0 0 1 30 30c0 8-3 14-7 19h35a14 14 0 0 1 0 28h-28v34l22 40a14 14 0 0 1-25 12l-27-36-27 36a14 14 0 0 1-25-12l22-40v-34H42a14 14 0 0 1 0-28h35c-4-5-7-11-7-19a30 30 0 0 1 30-30z" fill="#c2763b" stroke="#5a2e12" stroke-width="5"/>
  <circle cx="90" cy="56" r="5" fill="#fff"/><circle cx="110" cy="56" r="5" fill="#fff"/>
  <path d="M90 70q10 8 20 0" stroke="#fff" stroke-width="4" fill="none"/>
  <circle cx="100" cy="104" r="5" fill="#ef4444"/><circle cx="100" cy="124" r="5" fill="#22c55e"/>`);

const ELF = wrap(`
  <path d="M56 90L120 6L144 90Z" fill="#16a34a" stroke="#14532d" stroke-width="5"/>
  <circle cx="120" cy="8" r="10" fill="#facc15"/>
  <circle cx="100" cy="124" r="48" fill="#fcd9bd" stroke="#7c2d12" stroke-width="5"/>
  <path d="M52 116l-18-14 14 30zM148 116l18-14-14 30z" fill="#fcd9bd" stroke="#7c2d12" stroke-width="4"/>
  <circle cx="84" cy="118" r="6" fill="#1c1917"/><circle cx="116" cy="118" r="6" fill="#1c1917"/>
  <path d="M84 142q16 14 32 0" stroke="#7c2d12" stroke-width="5" fill="none" stroke-linecap="round"/>
  <rect x="52" y="84" width="96" height="14" rx="7" fill="#dc2626"/>`);

const SLEIGH = wrap(`
  <g opacity=".5" stroke="#fde68a" stroke-width="6" stroke-linecap="round"><path d="M2 90h30M6 120h26"/></g>
  <path d="M40 100h110q24 0 24 30v20H52q-12 0-12-14z" fill="#dc2626" stroke="#450a0a" stroke-width="5"/>
  <path d="M36 172h140q10 0 14-12" stroke="#facc15" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M60 150v22M150 150v22" stroke="#facc15" stroke-width="6"/>
  <rect x="70" y="62" width="40" height="40" rx="6" fill="#22c55e" stroke="#14532d" stroke-width="4"/>
  <path d="M90 62v40M70 82h40" stroke="#facc15" stroke-width="5"/>`);

const CHRISTMAS: Pack = {
  theme: "christmas",
  label: "Christmas",
  noun: "visitor",
  bg: "from-red-950 via-emerald-950 to-black",
  prizeById: {},
  prizeFallback: [
    { id: "santa", name: "Santa", lines: ["Ho ho ho! You caught me!"], svg: SANTA },
    { id: "rudolf", name: "Rudolf", lines: ["My nose led you right. Prize!"], svg: RUDOLF },
    { id: "snowman", name: "Frosty", lines: ["Cool catch! A treat for you."], svg: SNOWMAN },
    { id: "ginger", name: "Gingy", lines: ["You caught the gingerbread!"], svg: GINGER },
  ],
  hello: [
    { id: "elf", name: "Elfie", lines: ["Merry Christmas from SharEat!", "Santa is somewhere here…", "Busog ka na?"], svg: ELF },
  ],
  flyby: [{ id: "sleigh", name: "Sleigh", lines: ["Whoosh! Too fast!"], svg: SLEIGH }],
};

export const PACKS: Record<GhostTheme, Pack> = { halloween: HALLOWEEN, christmas: CHRISTMAS };

export function packFor(theme: string): Pack {
  return PACKS[theme as GhostTheme] ?? HALLOWEEN;
}

export function prizeCharacter(pack: Pack, prizeId: string, prizeIndex: number): Character {
  return pack.prizeById[prizeId] ?? pack.prizeFallback[Math.max(0, prizeIndex) % pack.prizeFallback.length];
}

export function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}
