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
  /** Width ÷ height of the art. Wide flyers (a sleigh team) need room. */
  aspect?: number;
};

export const DEFAULT_ASPECT = 200 / 220;

export type Pack = {
  theme: GhostTheme;
  label: string;
  noun: string;
  /** Prize characters keyed by prize id. */
  prizeById: Record<string, Character>;
  /**
   * Words that pick a prizeById character from any prize id: prize ids are
   * slugs of whatever name the admin typed ("1-serving-ramyeon"), so an exact
   * id match alone would miss most of them.
   */
  prizeKeywords?: Record<string, string[]>;
  /** Drawn for a prize with no character of its own, so no prize ever shows another prize's food. */
  unknownPrize?: Character;
  /** Packs whose characters are not tied to a food (Christmas) cycle through these. */
  prizeFallback: Character[];
  hello: Character[];
  flyby: Character[];
  bg: string;
};

export function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const wrap = (inner: string, w = 200, h = 220) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}">${inner}</svg>`;

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

/** Holding a red bowl of noodles, chopsticks lifting a strand, steam rising. */
const NOODLES = ghost(
  "#fff1db",
  `<g fill="none" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round" opacity=".9">
     <path d="M150 92q-6-10 0-20t0-20"/><path d="M166 90q-6-10 0-20t0-20"/>
   </g>
   <path d="M138 128h56q0 34-28 38q-28-4-28-38z" fill="#dc2626" stroke="#2a1a45" stroke-width="4" stroke-linejoin="round"/>
   <path d="M144 136h44" stroke="#fde68a" stroke-width="3"/>
   <path d="M142 128q8-8 16 0t16 0t16 0" stroke="#facc15" stroke-width="5" fill="none" stroke-linecap="round"/>
   <path d="M170 128q4-26 0-40" stroke="#facc15" stroke-width="4" fill="none" stroke-linecap="round"/>
   <path d="M160 70l26 50M170 66l22 52" stroke="#92400e" stroke-width="4" stroke-linecap="round"/>`
);

/** Carrying a wrapped gift with a question mark — for any prize without its own ghost. */
const GIFT = ghost(
  "#f1e8ff",
  `<rect x="138" y="112" width="52" height="50" rx="6" fill="#7c3aed" stroke="#2a1a45" stroke-width="4"/>
   <rect x="134" y="102" width="60" height="16" rx="4" fill="#8b5cf6" stroke="#2a1a45" stroke-width="4"/>
   <path d="M164 102v60" stroke="#facc15" stroke-width="7"/>
   <path d="M164 102q-18-20-24-6q0 8 24 6zM164 102q18-20 24-6q0 8-24 6z" fill="#facc15" stroke="#2a1a45" stroke-width="3"/>
   <text x="151" y="152" font-family="Arial Black,Arial" font-size="26" font-weight="900" fill="#fff" text-anchor="middle">?</text>`
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
    noodles: { id: "noodles", name: "Noodle Multo", lines: ["Slurp! Huli mo ako — noodles para sa'yo!"], svg: NOODLES },
  },
  prizeKeywords: {
    melona: ["melona"],
    coke: ["coke", "cola"],
    kimbap: ["kimbap", "gimbap"],
    enoki: ["enoki"],
    noodles: ["noodle", "ramyeon", "ramen", "ramyun", "pancit", "mami"],
  },
  unknownPrize: { id: "gift", name: "Surprise Boo", lines: ["You caught me! May prize ka!"], svg: GIFT },
  prizeFallback: [{ id: "gift", name: "Surprise Boo", lines: ["You caught me!"], svg: GIFT }],
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

const INK = "#3b0d0d";

/** Santa's face, beard and hat — shared by the standing and sleigh-riding Santas. */
const SANTA_HEAD = `
  <circle cx="100" cy="72" r="30" fill="#fcd5b5" stroke="${INK}" stroke-width="3"/>
  <circle cx="80" cy="80" r="7" fill="#f9a8a8" opacity=".8"/><circle cx="120" cy="80" r="7" fill="#f9a8a8" opacity=".8"/>
  <path d="M66 78Q66 132 100 134Q134 132 134 78Q120 96 100 94Q80 96 66 78Z" fill="#fff" stroke="#d6d3d1" stroke-width="3"/>
  <path d="M100 90q-8-8-22-2q8 10 22 4q14 6 22-4q-14-6-22 2z" fill="#fff" stroke="#d6d3d1" stroke-width="2"/>
  <circle cx="100" cy="83" r="6" fill="#f87171"/>
  <ellipse cx="89" cy="70" rx="4" ry="5" fill="${INK}"/><ellipse cx="111" cy="70" rx="4" ry="5" fill="${INK}"/>
  <circle cx="90" cy="68" r="1.5" fill="#fff"/><circle cx="112" cy="68" r="1.5" fill="#fff"/>
  <path d="M82 60q7-5 14 0M104 60q7-5 14 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M68 56Q70 18 112 14Q146 12 160 44L148 54Q138 36 124 38Q136 46 134 56Z" fill="#dc2626" stroke="${INK}" stroke-width="3"/>
  <rect x="64" y="50" width="74" height="14" rx="7" fill="#fff" stroke="#d6d3d1" stroke-width="2"/>
  <circle cx="156" cy="52" r="10" fill="#fff" stroke="#d6d3d1" stroke-width="2"/>`;

const SANTA = wrap(`
  <rect x="68" y="190" width="26" height="22" rx="8" fill="#1c1917"/><rect x="106" y="190" width="26" height="22" rx="8" fill="#1c1917"/>
  <rect x="72" y="168" width="22" height="26" fill="#b91c1c"/><rect x="106" y="168" width="22" height="26" fill="#b91c1c"/>
  <path d="M146 116Q168 96 176 66" stroke="#dc2626" stroke-width="18" fill="none" stroke-linecap="round"/>
  <circle cx="178" cy="60" r="11" fill="#166534" stroke="${INK}" stroke-width="3"/>
  <path d="M56 120Q40 140 36 162" stroke="#dc2626" stroke-width="18" fill="none" stroke-linecap="round"/>
  <circle cx="35" cy="168" r="11" fill="#166534" stroke="${INK}" stroke-width="3"/>
  <ellipse cx="100" cy="140" rx="54" ry="46" fill="#dc2626" stroke="${INK}" stroke-width="3"/>
  <ellipse cx="100" cy="180" rx="52" ry="9" fill="#fff" stroke="#d6d3d1" stroke-width="2"/>
  <rect x="95" y="100" width="10" height="78" fill="#fff"/>
  <rect x="47" y="140" width="106" height="14" fill="#1c1917"/>
  <rect x="87" y="136" width="26" height="22" rx="3" fill="none" stroke="#facc15" stroke-width="4"/>
  ${SANTA_HEAD}`);

/** Rudolf flying, facing right, in a 240×200 box. Used alone and in front of the sleigh. */
const RUDOLF_BODY = `
  <defs><radialGradient id="glow"><stop offset="0" stop-color="#ff4d4d" stop-opacity=".9"/><stop offset="1" stop-color="#ff4d4d" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="34" cy="96" rx="12" ry="9" fill="#fff" stroke="#4a2511" stroke-width="3"/>
  <path d="M62 118L44 146L26 140M82 124L70 154L52 152" stroke="#8b4513" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M138 120L160 144L182 136M154 112L180 128L200 116" stroke="#8b4513" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="140" r="6" fill="#292524"/><circle cx="50" cy="152" r="6" fill="#292524"/>
  <circle cx="184" cy="136" r="6" fill="#292524"/><circle cx="202" cy="115" r="6" fill="#292524"/>
  <ellipse cx="100" cy="104" rx="64" ry="32" fill="#a0522d" stroke="#4a2511" stroke-width="4"/>
  <ellipse cx="106" cy="118" rx="40" ry="13" fill="#deb887"/>
  <path d="M140 92Q156 60 168 56L184 74Q166 92 156 112Z" fill="#a0522d" stroke="#4a2511" stroke-width="4" stroke-linejoin="round"/>
  <path d="M146 92q14 6 26-6" stroke="#dc2626" stroke-width="9" fill="none" stroke-linecap="round"/>
  <circle cx="160" cy="96" r="7" fill="#facc15" stroke="#a16207" stroke-width="2"/>
  <path d="M168 44C162 24 150 14 138 8M157 27L142 24M178 42C182 20 194 10 206 6M187 23L202 22" stroke="#6b3f1d" stroke-width="6" fill="none" stroke-linecap="round"/>
  <ellipse cx="160" cy="50" rx="8" ry="13" fill="#a0522d" stroke="#4a2511" stroke-width="3" transform="rotate(-40 160 50)"/>
  <ellipse cx="180" cy="64" rx="28" ry="23" fill="#a0522d" stroke="#4a2511" stroke-width="4"/>
  <ellipse cx="202" cy="74" rx="20" ry="14" fill="#c68642" stroke="#4a2511" stroke-width="3"/>
  <circle cx="184" cy="58" r="5.5" fill="#1c1917"/><circle cx="186" cy="56" r="2" fill="#fff"/>
  <path d="M192 84q8 5 16 0" stroke="#4a2511" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="220" cy="72" r="20" fill="url(#glow)"/>
  <circle cx="220" cy="72" r="10" fill="#ef233c" stroke="#7f1d1d" stroke-width="2.5"/>
  <circle cx="217" cy="68" r="3" fill="#fff" opacity=".85"/>`;

const RUDOLF = wrap(RUDOLF_BODY, 240, 200);

/** Santa in his sleigh, pulled by Rudolf, flying right. 420×200. */
const SLEIGH_TEAM = wrap(
  `
  <g fill="#fde68a"><path d="M8 112l4 8 8 2-8 3-4 8-3-8-8-3 8-2z"/><path d="M30 80l3 6 6 2-6 2-3 6-2-6-6-2 6-2z" opacity=".7"/><circle cx="14" cy="150" r="3"/></g>
  <path d="M168 120Q230 96 296 104" stroke="#7c2d12" stroke-width="3" fill="none"/>
  <g transform="translate(36 40) scale(.62)">
    <ellipse cx="70" cy="70" rx="44" ry="42" fill="#92400e" stroke="#451a03" stroke-width="5"/>
    <rect x="40" y="18" width="34" height="30" rx="5" fill="#22c55e" stroke="#14532d" stroke-width="4"/>
    <rect x="76" y="10" width="30" height="36" rx="5" fill="#3b82f6" stroke="#1e3a8a" stroke-width="4"/>
    <path d="M57 18v30M91 10v36" stroke="#facc15" stroke-width="5"/>
  </g>
  <g transform="translate(58 -10) scale(.78)">${SANTA_HEAD}
    <ellipse cx="100" cy="150" rx="48" ry="34" fill="#dc2626" stroke="${INK}" stroke-width="3"/>
    <path d="M140 140Q164 120 172 92" stroke="#dc2626" stroke-width="16" fill="none" stroke-linecap="round"/>
    <circle cx="174" cy="86" r="10" fill="#166534" stroke="${INK}" stroke-width="3"/>
  </g>
  <path d="M44 110H172Q196 110 196 136V152H70Q44 152 44 128Z" fill="#dc2626" stroke="#450a0a" stroke-width="5"/>
  <path d="M52 124H186" stroke="#facc15" stroke-width="5"/>
  <path d="M60 152v22M168 152v22" stroke="#facc15" stroke-width="6"/>
  <path d="M30 174H196Q214 174 218 156" stroke="#facc15" stroke-width="7" fill="none" stroke-linecap="round"/>
  <g transform="translate(200 18) scale(.92)">${RUDOLF_BODY}</g>`,
  420,
  200
);

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

const CHRISTMAS: Pack = {
  theme: "christmas",
  label: "Christmas",
  noun: "visitor",
  bg: "from-red-950 via-emerald-950 to-black",
  prizeById: {},
  prizeFallback: [
    { id: "santa", name: "Santa", lines: ["Ho ho ho! You caught me!"], svg: SANTA },
    { id: "rudolf", name: "Rudolf", lines: ["My nose led you right. Prize!"], svg: RUDOLF, aspect: 240 / 200 },
    { id: "snowman", name: "Frosty", lines: ["Cool catch! A treat for you."], svg: SNOWMAN },
    { id: "ginger", name: "Gingy", lines: ["You caught the gingerbread!"], svg: GINGER },
  ],
  hello: [
    { id: "elf", name: "Elfie", lines: ["Merry Christmas from SharEat!", "Santa is somewhere here…", "Busog ka na?"], svg: ELF },
  ],
  // Fly-bys are drawn facing right; the phone mirrors them when they fly left.
  flyby: [
    { id: "sleigh", name: "Santa's sleigh", lines: ["Ho ho whoosh! Too fast!"], svg: SLEIGH_TEAM, aspect: 420 / 200 },
    { id: "rudolf-fly", name: "Rudolf", lines: ["Zoom! Rudolf is on a delivery run!"], svg: RUDOLF, aspect: 240 / 200 },
  ],
};

export const PACKS: Record<GhostTheme, Pack> = { halloween: HALLOWEEN, christmas: CHRISTMAS };

export function packFor(theme: string): Pack {
  return PACKS[theme as GhostTheme] ?? HALLOWEEN;
}

/**
 * Which character carries a prize: an exact id, then a keyword anywhere in the
 * id ("1-serving-ramyeon" → noodles), then the pack's gift ghost. Only packs
 * whose characters hold no particular food (Christmas) cycle by position — so a
 * Halloween prize is never drawn holding another prize's food.
 */
export function prizeCharacter(pack: Pack, prizeId: string, prizeIndex: number): Character {
  const id = String(prizeId || "").toLowerCase();
  if (pack.prizeById[id]) return pack.prizeById[id];
  for (const [key, words] of Object.entries(pack.prizeKeywords ?? {})) {
    if (words.some((w) => id.includes(w)) && pack.prizeById[key]) return pack.prizeById[key];
  }
  if (pack.unknownPrize) return pack.unknownPrize;
  return pack.prizeFallback[Math.max(0, prizeIndex) % pack.prizeFallback.length];
}

export function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

/** Santa's sleigh team as a ready-to-use image URL — also flies across the app as Christmas decoration. */
export const SLEIGH_TEAM_URL = svgUrl(SLEIGH_TEAM);
