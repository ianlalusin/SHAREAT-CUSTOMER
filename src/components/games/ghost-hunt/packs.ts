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
  /** Who is hiding, as a sentence subject: "Ghosts", "Santa and friends". */
  crowd: string;
  /** Goes in the share caption. */
  emoji: string;
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

const MELONA_PROP = `<rect x="146" y="96" width="34" height="58" rx="13" fill="#8fd16a" stroke="#2a1a45" stroke-width="4"/>
   <rect x="152" y="104" width="8" height="40" rx="4" fill="#bdeb9d"/>
   <rect x="158" y="152" width="10" height="28" rx="4" fill="#e8c48a" stroke="#2a1a45" stroke-width="3"/>
   <text x="163" y="132" font-family="Arial Black,Arial" font-size="11" font-weight="900" fill="#2f6b1c" text-anchor="middle" transform="rotate(-90 163 128)">MELONA</text>`;
const MELONA = ghost("#d7f5c3", MELONA_PROP);

const COKE_PROP = `<path d="M156 78h14v12c8 8 10 18 10 30v52c0 6-4 10-10 10h-14c-6 0-10-4-10-10v-52c0-12 2-22 10-30z" fill="#e11d2e" stroke="#2a1a45" stroke-width="4"/>
   <rect x="154" y="72" width="18" height="8" rx="2" fill="#b91c1c" stroke="#2a1a45" stroke-width="3"/>
   <path d="M148 132q15-10 30 0" stroke="#fff" stroke-width="5" fill="none"/>
   <text x="163" y="156" font-family="Arial Black,Arial" font-size="10" fill="#fff" text-anchor="middle">1.5L</text>`;
const COKE = ghost("#ffe3e3", COKE_PROP);

const KIMBAP_PROP = `<circle cx="160" cy="132" r="26" fill="#1f2a1f" stroke="#2a1a45" stroke-width="4"/>
   <circle cx="160" cy="132" r="20" fill="#fffdf5"/>
   <rect x="150" y="122" width="7" height="7" rx="2" fill="#f59e0b"/>
   <rect x="161" y="121" width="8" height="6" rx="2" fill="#22c55e"/>
   <rect x="153" y="134" width="10" height="5" rx="2" fill="#facc15"/>
   <rect x="164" y="132" width="6" height="9" rx="2" fill="#ef4444"/>
   <circle cx="160" cy="132" r="3" fill="#a16207"/>`;
const KIMBAP = ghost("#ffffff", KIMBAP_PROP);

const ENOKI_PROP = `<g stroke="#2a1a45" stroke-width="3">
     <path d="M150 168V108M158 168V100M166 168V104M174 168V112" stroke="#f5ecd7" stroke-width="5"/>
     <circle cx="150" cy="106" r="5" fill="#fffaf0"/><circle cx="158" cy="98" r="5" fill="#fffaf0"/>
     <circle cx="166" cy="102" r="5" fill="#fffaf0"/><circle cx="174" cy="110" r="5" fill="#fffaf0"/>
     <rect x="142" y="140" width="40" height="22" rx="6" fill="#b45309"/>
   </g>
   <path d="M146 150h32" stroke="#7c2d12" stroke-width="3"/>`;
const ENOKI = ghost("#fff6e6", ENOKI_PROP);

/** Holding a red bowl of noodles, chopsticks lifting a strand, steam rising. */
const NOODLES_PROP = `<g fill="none" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round" opacity=".9">
     <path d="M150 92q-6-10 0-20t0-20"/><path d="M166 90q-6-10 0-20t0-20"/>
   </g>
   <path d="M138 128h56q0 34-28 38q-28-4-28-38z" fill="#dc2626" stroke="#2a1a45" stroke-width="4" stroke-linejoin="round"/>
   <path d="M144 136h44" stroke="#fde68a" stroke-width="3"/>
   <path d="M142 128q8-8 16 0t16 0t16 0" stroke="#facc15" stroke-width="5" fill="none" stroke-linecap="round"/>
   <path d="M170 128q4-26 0-40" stroke="#facc15" stroke-width="4" fill="none" stroke-linecap="round"/>
   <path d="M160 70l26 50M170 66l22 52" stroke="#92400e" stroke-width="4" stroke-linecap="round"/>`;
const NOODLES = ghost("#fff1db", NOODLES_PROP);

/** Carrying a wrapped gift with a question mark — for any prize without its own ghost. */
const GIFT_PROP = `<rect x="138" y="112" width="52" height="50" rx="6" fill="#7c3aed" stroke="#2a1a45" stroke-width="4"/>
   <rect x="134" y="102" width="60" height="16" rx="4" fill="#8b5cf6" stroke="#2a1a45" stroke-width="4"/>
   <path d="M164 102v60" stroke="#facc15" stroke-width="7"/>
   <path d="M164 102q-18-20-24-6q0 8 24 6zM164 102q18-20 24-6q0 8-24 6z" fill="#facc15" stroke="#2a1a45" stroke-width="3"/>
   <text x="151" y="152" font-family="Arial Black,Arial" font-size="26" font-weight="900" fill="#fff" text-anchor="middle">?</text>`;
const GIFT = ghost("#f1e8ff", GIFT_PROP);

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
  crowd: "Ghosts",
  emoji: "👻",
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

/**
 * Circles merged into one outlined blob (fur trim, beards, pompoms, snow):
 * an ink pass first, the fill on top, so only the outer edge shows a line.
 */
const fluff = (cs: number[][], fill = "#fffdf8", w = 4) =>
  cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + w / 2}" fill="${INK}"/>`).join("") +
  cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join("");

/** A thick outlined stroke (arms, legs, antlers, twigs): ink underneath, colour on top. */
const limb = (d: string, color: string, w = 16) =>
  `<path d="${d}" stroke="${INK}" stroke-width="${w + 8}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Shiny eye: dark oval with two catch-lights. */
const eye = (x: number, y: number, rx = 4.5, ry = 5.5) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#1c1917"/>` +
  `<circle cx="${x + rx * 0.35}" cy="${y - ry * 0.4}" r="${rx * 0.42}" fill="#fff"/>` +
  `<circle cx="${x - rx * 0.35}" cy="${y + ry * 0.4}" r="${rx * 0.2}" fill="#fff"/>`;

const blush = (x: number, y: number, r = 6) =>
  `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.7}" fill="#fb7185" opacity=".45"/>`;

const SKIN_STOPS = `<stop offset="0" stop-color="#ffe9d6"/><stop offset="1" stop-color="#f2b089"/>`;

/** Santa's face, beard and hat: shared by the standing and sleigh-riding Santas. Carries his gradients. */
const SANTA_HEAD = `
  <defs>
    <radialGradient id="sSkin" cx=".4" cy=".35" r=".75">${SKIN_STOPS}</radialGradient>
    <linearGradient id="sRed" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#f87171"/><stop offset=".5" stop-color="#dc2626"/><stop offset="1" stop-color="#9f1239"/></linearGradient>
    <radialGradient id="sMitt" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#15803d"/></radialGradient>
    <linearGradient id="sGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#d97706"/></linearGradient>
  </defs>
  <path d="M64 60C62 24 92 6 120 12C144 17 160 32 165 50L154 58C150 46 142 38 132 36C138 44 140 52 140 60Z" fill="url(#sRed)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M92 22C106 16 122 18 134 26" stroke="#fecaca" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
  <circle cx="72" cy="82" r="7" fill="url(#sSkin)" stroke="${INK}" stroke-width="3"/>
  <circle cx="128" cy="82" r="7" fill="url(#sSkin)" stroke="${INK}" stroke-width="3"/>
  <circle cx="100" cy="80" r="28" fill="url(#sSkin)" stroke="${INK}" stroke-width="4"/>
  ${eye(89, 80)}${eye(111, 80)}
  ${blush(79, 90)}${blush(121, 90)}
  <path d="M80 71q8-6 16-1M104 70q8-5 16 1" stroke="${INK}" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M80 71q8-6 16-1M104 70q8-5 16 1" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
  ${fluff([[74, 98, 11], [80, 112, 13], [92, 122, 14], [108, 122, 14], [120, 112, 13], [126, 98, 11], [100, 110, 14]])}
  <path d="M93 102Q100 110 107 102Z" fill="#9f1239"/>
  <path d="M100 96C92 87 78 87 71 97C80 102 92 101 100 97C108 101 120 102 129 97C122 87 108 87 100 96Z" fill="#fffdf8" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="100" cy="90" r="6.5" fill="#f87171" stroke="${INK}" stroke-width="2.5"/><circle cx="98" cy="88" r="2" fill="#fff" opacity=".9"/>
  ${fluff([[66, 58, 9], [78, 55, 9.5], [91, 53, 9.5], [104, 53, 9.5], [117, 54, 9.5], [129, 56, 9], [140, 59, 8]])}
  ${fluff([[160, 56, 11], [152, 63, 5], [168, 63, 5]])}`;

/** Standing Santa; `inHand` sits behind his raised right mitten so he grips it. */
const santa = (inHand = "") =>
  wrap(`
  <rect x="70" y="166" width="22" height="30" fill="url(#sRed)" stroke="${INK}" stroke-width="4"/>
  <rect x="108" y="166" width="22" height="30" fill="url(#sRed)" stroke="${INK}" stroke-width="4"/>
  <path d="M94 192v10q0 8-8 8H62q-10 0-10-8q0-10 10-10z" fill="#292524" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M106 192v10q0 8 8 8h24q10 0 10-8q0-10-10-10z" fill="#292524" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M60 198h14M126 198h14" stroke="#fff" stroke-width="3" opacity=".3" stroke-linecap="round"/>
  ${limb("M58 120Q42 138 38 158", "#dc2626")}
  ${fluff([[38, 160, 8], [46, 163, 6], [31, 163, 6]])}
  <circle cx="36" cy="173" r="10" fill="url(#sMitt)" stroke="${INK}" stroke-width="4"/>
  ${limb("M144 118Q166 98 174 78", "#dc2626")}
  ${fluff([[175, 76, 8], [168, 79, 6], [182, 78, 6]])}
  ${inHand}
  <circle cx="178" cy="60" r="11" fill="url(#sMitt)" stroke="${INK}" stroke-width="4"/>
  <ellipse cx="100" cy="142" rx="54" ry="46" fill="url(#sRed)" stroke="${INK}" stroke-width="4"/>
  <path d="M58 122Q66 108 80 102" stroke="#fecaca" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>
  <rect x="93" y="100" width="14" height="80" fill="#fffdf8"/>
  <circle cx="100" cy="124" r="3" fill="${INK}"/><circle cx="100" cy="166" r="3" fill="${INK}"/>
  <path d="M47 138H153V152H47Z" fill="#292524" stroke="${INK}" stroke-width="3"/>
  <rect x="86" y="134" width="28" height="22" rx="4" fill="none" stroke="url(#sGold)" stroke-width="5"/>
  ${fluff([[52, 177, 8], [64, 182, 9], [78, 185, 9], [92, 186, 9], [108, 186, 9], [122, 185, 9], [136, 182, 9], [148, 177, 8]])}
  ${SANTA_HEAD}`);

const SANTA = santa();

/** Rudolf flying, facing right, in a 240×200 box. Used alone and in front of the sleigh. */
const RUDOLF_BODY = `
  <defs>
    <radialGradient id="rFur" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#cf9260"/><stop offset="1" stop-color="#8a4b24"/></radialGradient>
    <radialGradient id="rGlow"><stop offset="0" stop-color="#ff4d4d" stop-opacity=".85"/><stop offset="1" stop-color="#ff4d4d" stop-opacity="0"/></radialGradient>
    <radialGradient id="rNose" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff9a9a"/><stop offset="1" stop-color="#c1121f"/></radialGradient>
    <radialGradient id="rBell" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fef08a"/><stop offset="1" stop-color="#ca8a04"/></radialGradient>
  </defs>
  ${fluff([[36, 94, 10], [27, 99, 7]])}
  ${limb("M70 118L52 142L32 140", "#6b3a1c", 9)}
  ${limb("M146 116L170 136L190 128", "#6b3a1c", 9)}
  <ellipse cx="32" cy="140" rx="6" ry="7" fill="#292524"/><ellipse cx="191" cy="128" rx="6" ry="7" fill="#292524"/>
  <ellipse cx="100" cy="104" rx="62" ry="30" fill="url(#rFur)" stroke="${INK}" stroke-width="4"/>
  <ellipse cx="106" cy="119" rx="40" ry="10" fill="#f1d7b6"/>
  <path d="M60 88Q82 78 112 80" stroke="#e8b585" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>
  ${limb("M84 124L72 152L54 154", "#8a4b24", 10)}
  ${limb("M134 122L158 146L182 142", "#8a4b24", 10)}
  <ellipse cx="53" cy="154" rx="6" ry="7" fill="#292524"/><ellipse cx="183" cy="142" rx="6" ry="7" fill="#292524"/>
  ${limb("M166 46C160 28 150 18 138 12M157 30L143 26", "#d6a35c", 5)}
  ${limb("M180 44C184 24 196 14 208 10M189 26L203 24", "#d6a35c", 5)}
  <path d="M138 92Q150 64 166 58L188 76Q168 92 158 112Z" fill="url(#rFur)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="158" cy="52" rx="8" ry="14" fill="url(#rFur)" stroke="${INK}" stroke-width="3" transform="rotate(-45 158 52)"/>
  <ellipse cx="158" cy="52" rx="3.5" ry="8" fill="#f9a8d4" transform="rotate(-45 158 52)"/>
  <ellipse cx="182" cy="64" rx="28" ry="23" fill="url(#rFur)" stroke="${INK}" stroke-width="4"/>
  <ellipse cx="203" cy="75" rx="20" ry="14" fill="#e3b27c" stroke="${INK}" stroke-width="3"/>
  ${eye(185, 57, 5, 6.5)}
  <path d="M178 46q7-4 13 0" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  ${blush(193, 71, 5)}
  <path d="M194 85q8 5 16 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M146 94q14 8 28-4" stroke="${INK}" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M146 94q14 8 28-4" stroke="#dc2626" stroke-width="7" fill="none" stroke-linecap="round"/>
  <circle cx="160" cy="100" r="7.5" fill="url(#rBell)" stroke="${INK}" stroke-width="2.5"/><path d="M156 102h8" stroke="${INK}" stroke-width="2"/>
  <circle cx="220" cy="72" r="22" fill="url(#rGlow)"/>
  <circle cx="220" cy="72" r="10" fill="url(#rNose)" stroke="#7f1d1d" stroke-width="2.5"/>
  <circle cx="216.5" cy="68" r="3" fill="#fff" opacity=".9"/>`;

const RUDOLF = wrap(RUDOLF_BODY, 240, 200);

/** Santa in his sleigh, pulled by Rudolf, flying right. 420×200. */
const SLEIGH_TEAM = wrap(
  `
  <defs><linearGradient id="slBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#991b1b"/></linearGradient></defs>
  <g fill="#fde68a"><path d="M8 112l4 8 8 2-8 3-4 8-3-8-8-3 8-2z"/><path d="M30 80l3 6 6 2-6 2-3 6-2-6-6-2 6-2z" opacity=".7"/><circle cx="14" cy="150" r="3"/></g>
  <path d="M168 120Q230 96 296 104" stroke="#7c2d12" stroke-width="3" fill="none"/>
  <g transform="translate(36 40) scale(.62)">
    <ellipse cx="70" cy="70" rx="44" ry="42" fill="#a16207" stroke="${INK}" stroke-width="5"/>
    <rect x="40" y="18" width="34" height="30" rx="5" fill="#22c55e" stroke="${INK}" stroke-width="4"/>
    <rect x="76" y="10" width="30" height="36" rx="5" fill="#3b82f6" stroke="${INK}" stroke-width="4"/>
    <path d="M57 18v30M91 10v36" stroke="#facc15" stroke-width="5"/>
  </g>
  <g transform="translate(58 -10) scale(.78)">
    ${limb("M140 140Q164 120 172 92", "#dc2626", 14)}
    <circle cx="174" cy="86" r="10" fill="url(#sMitt)" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="100" cy="150" rx="48" ry="34" fill="url(#sRed)" stroke="${INK}" stroke-width="4"/>
    ${SANTA_HEAD}
  </g>
  <path d="M44 110H172Q198 110 198 136V152H70Q44 152 44 128Z" fill="url(#slBody)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M52 122H190" stroke="#facc15" stroke-width="5"/>
  <path d="M62 140q10-8 20 0t20 0t20 0t20 0t20 0t20 0" stroke="#facc15" stroke-width="3" fill="none"/>
  <path d="M60 152v22M168 152v22" stroke="#d97706" stroke-width="6"/>
  <path d="M24 174H196Q216 174 220 156Q222 146 212 146" stroke="#facc15" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M24 174q-10 0-10-10" stroke="#facc15" stroke-width="7" fill="none" stroke-linecap="round"/>
  <g transform="translate(200 18) scale(.92)">${RUDOLF_BODY}</g>`,
  420,
  200
);

const snowman = (inHand = "") =>
  wrap(`
  <defs>
    <radialGradient id="fSnow" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#eef6ff"/><stop offset="1" stop-color="#c7dcf5"/></radialGradient>
    <linearGradient id="fCarrot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#ea580c"/></linearGradient>
  </defs>
  ${limb("M58 146L28 124M38 131L32 116M38 131L22 133", "#7c4a1e", 4)}
  <circle cx="100" cy="162" r="50" fill="url(#fSnow)" stroke="${INK}" stroke-width="4"/>
  <circle cx="100" cy="84" r="36" fill="url(#fSnow)" stroke="${INK}" stroke-width="4"/>
  ${eye(87, 80, 4.5, 5)}${eye(113, 80, 4.5, 5)}
  ${blush(79, 94)}${blush(121, 94)}
  <path d="M100 88l30 8-30 6z" fill="url(#fCarrot)" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M110 91l-1 6M118 93l-1 5" stroke="#c2410c" stroke-width="1.5"/>
  <g fill="#1c1917"><circle cx="87" cy="105" r="2.4"/><circle cx="93" cy="109" r="2.4"/><circle cx="100" cy="110" r="2.4"/><circle cx="107" cy="109" r="2.4"/><circle cx="113" cy="105" r="2.4"/></g>
  <path d="M74 124L66 160L82 162L86 128Z" fill="#dc2626" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M68 160l-1 7M74 161v7M80 161l1 7" stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>
  <path d="M66 112Q100 128 134 112L136 124Q100 140 64 124Z" fill="#dc2626" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M82 119v9M100 122v9M118 119v9" stroke="#fef3c7" stroke-width="4"/>
  <g fill="#1c1917"><circle cx="100" cy="150" r="5"/><circle cx="100" cy="170" r="5"/><circle cx="100" cy="190" r="5"/></g>
  <g fill="#fff"><circle cx="98" cy="148" r="1.5"/><circle cx="98" cy="168" r="1.5"/><circle cx="98" cy="188" r="1.5"/></g>
  <path d="M76 52V18Q76 12 82 12H118Q124 12 124 18V52Z" fill="#27272a" stroke="${INK}" stroke-width="4"/>
  <rect x="78" y="38" width="44" height="9" fill="#dc2626"/>
  <path d="M84 18v16" stroke="#52525b" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="100" cy="52" rx="36" ry="7" fill="#27272a" stroke="${INK}" stroke-width="4"/>
  <path d="M110 42q6-12 16-6q-8 2-8 10q-4-5-8-4zM110 42q-2-12 -12-12q4 6 0 12q6-2 12 0z" fill="#16a34a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="108" cy="44" r="3.5" fill="#ef4444" stroke="${INK}" stroke-width="1.5"/><circle cx="114" cy="46" r="3.5" fill="#ef4444" stroke="${INK}" stroke-width="1.5"/>
  ${inHand}`);

const SNOWMAN = snowman(limb("M142 146L172 124M162 131L168 116M162 131L178 133", "#7c4a1e", 4));

const GINGY_OUTLINE =
  "M100 30a30 30 0 0 1 30 30c0 8-3 14-7 19h35a14 14 0 0 1 0 28h-28v34l22 40a14 14 0 0 1-25 12l-27-36-27 36a14 14 0 0 1-25-12l22-40v-34H42a14 14 0 0 1 0-28h35c-4-5-7-11-7-19a30 30 0 0 1 30-30z";

const ginger = (inHand = "") =>
  wrap(`
  <defs><radialGradient id="gDough" cx=".45" cy=".3" r=".85"><stop offset="0" stop-color="#e8a86c"/><stop offset="1" stop-color="#a65a26"/></radialGradient></defs>
  <path d="${GINGY_OUTLINE}" fill="url(#gDough)" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
  <g stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M46 83l6 4-6 4 6 4-6 4 6 4"/>
    <path d="M154 83l-6 4 6 4-6 4 6 4-6 4"/>
    <path d="M47 170q5 6 9 5q4 6 9 5"/>
    <path d="M153 170q-5 6-9 5q-4 6-9 5"/>
    <path d="M82 40q4-5 9 0t9 0t9 0t9 0"/>
    <path d="M90 68q10 9 20 0"/>
  </g>
  ${eye(90, 56, 4.5, 5.5)}${eye(110, 56, 4.5, 5.5)}
  ${blush(81, 66, 5)}${blush(119, 66, 5)}
  <path d="M100 87L86 80V94ZM100 87L114 80V94Z" fill="#dc2626" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="100" cy="87" r="4" fill="#b91c1c" stroke="${INK}" stroke-width="2"/>
  <circle cx="100" cy="110" r="6" fill="#ef4444" stroke="${INK}" stroke-width="2.5"/><circle cx="98" cy="108" r="2" fill="#fff" opacity=".8"/>
  <circle cx="100" cy="130" r="6" fill="#22c55e" stroke="${INK}" stroke-width="2.5"/><circle cx="98" cy="128" r="2" fill="#fff" opacity=".8"/>
  ${inHand}`);

const GINGER = ginger();

/** Full-body elf; `rightArm` is drawn before `inHand` so a held thing sits over the arm. */
const elf = (inHand = "", rightArm = limb("M130 136Q150 128 160 110", "#16a34a", 13) + `<circle cx="162" cy="106" r="8" fill="url(#eSkin)" stroke="${INK}" stroke-width="3.5"/>`) =>
  wrap(`
  <defs>
    <radialGradient id="eSkin" cx=".4" cy=".35" r=".75">${SKIN_STOPS}</radialGradient>
    <linearGradient id="eGreen" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset=".55" stop-color="#16a34a"/><stop offset="1" stop-color="#14532d"/></linearGradient>
  </defs>
  <rect x="82" y="174" width="14" height="24" fill="#fff" stroke="${INK}" stroke-width="3.5"/>
  <rect x="104" y="174" width="14" height="24" fill="#fff" stroke="${INK}" stroke-width="3.5"/>
  <path d="M84 180h10M84 188h10M106 180h10M106 188h10" stroke="#dc2626" stroke-width="4"/>
  <path d="M98 194v10H70q-10 0-12-12q8 6 14 2z" fill="#dc2626" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M102 194v10h28q10 0 12-12q-8 6-14 2z" fill="#dc2626" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <circle cx="58" cy="191" r="4" fill="#facc15" stroke="${INK}" stroke-width="2"/><circle cx="142" cy="191" r="4" fill="#facc15" stroke="${INK}" stroke-width="2"/>
  ${limb("M70 136Q52 150 48 168", "#16a34a", 13)}
  <circle cx="47" cy="172" r="8" fill="url(#eSkin)" stroke="${INK}" stroke-width="3.5"/>
  ${rightArm}
  <path d="M70 122Q66 156 62 176L71 184L80 178L90 186L100 179L110 186L120 178L129 184L138 176Q134 156 130 122Z" fill="url(#eGreen)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <rect x="66" y="152" width="68" height="9" fill="#292524"/>
  <rect x="93" y="150" width="14" height="13" rx="2" fill="none" stroke="#facc15" stroke-width="3"/>
  <path d="M68 120L76 134L84 126L92 136L100 127L108 136L116 126L124 134L132 120Z" fill="#dc2626" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M70 96L44 80L60 110Z" fill="url(#eSkin)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M130 96L156 80L140 110Z" fill="url(#eSkin)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M64 96L52 88L60 104ZM136 96L148 88L140 104Z" fill="#f9a8a8"/>
  <circle cx="100" cy="96" r="32" fill="url(#eSkin)" stroke="${INK}" stroke-width="4"/>
  ${eye(89, 97)}${eye(111, 97)}
  ${blush(79, 108)}${blush(121, 108)}
  <g fill="#c2703d" opacity=".6"><circle cx="76" cy="103" r="1.3"/><circle cx="81" cy="101" r="1.3"/><circle cx="119" cy="101" r="1.3"/><circle cx="124" cy="103" r="1.3"/></g>
  <circle cx="100" cy="104" r="3.5" fill="#f4a582"/>
  <path d="M90 111q10 9 20 0" stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M68 82Q74 36 110 22Q140 12 160 30Q140 28 128 42Q134 60 134 82Z" fill="url(#eGreen)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M90 40Q100 30 116 26" stroke="#86efac" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
  <circle cx="161" cy="32" r="7" fill="#facc15" stroke="${INK}" stroke-width="3"/>
  ${fluff([[68, 80, 8], [80, 77, 8], [92, 76, 8], [104, 76, 8], [116, 77, 8], [128, 79, 8], [136, 82, 7]])}
  ${inHand}`);

const ELF = elf();

/* Prize carriers: the Halloween ghosts' props, moved into each character's hands. */

/** Santa raising a 1.5L Coke like a toast. */
const SANTA_COKE = santa(`<g transform="translate(88 -34) scale(.55)">${COKE_PROP}</g>`);
/** Santa holding up a wrapped mystery gift: any prize without its own carrier. */
const SANTA_GIFT = santa(
  `<g transform="translate(76 -40) scale(.62)">${GIFT_PROP.replace("#7c3aed", "#16a34a").replace("#8b5cf6", "#22c55e")}</g>`
);
/** Rudolf on a delivery run, an enoki tray strapped to his back. */
const RUDOLF_ENOKI = wrap(
  `${RUDOLF_BODY}
  <g transform="translate(-62 -88)">${ENOKI_PROP}</g>
  <path d="M78 76q22 8 44 0" stroke="#dc2626" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  240,
  200
);
/** Frosty with a Melona, twig arm reaching for it. */
const SNOWMAN_MELONA = snowman(`${limb("M140 150L160 140", "#7c4a1e", 4)}${MELONA_PROP}`);
/** Gingy holding a kimbap slice up in his right hand. */
const GINGER_KIMBAP = ginger(`<g transform="translate(6 -66)">${KIMBAP_PROP}</g>`);
/** Elfie carrying a steaming bowl of noodles, hand under the bowl. */
const ELF_NOODLES = elf(
  `<g transform="translate(4 16)">${NOODLES_PROP}</g>
  <circle cx="170" cy="186" r="8" fill="url(#eSkin)" stroke="${INK}" stroke-width="3.5"/>`,
  limb("M130 136Q148 166 166 182", "#16a34a", 13)
);

/** A parol (Filipino Christmas star lantern) with a face: the friendly greeter. */
const PAROL = wrap(`
  <defs>
    <radialGradient id="pHalo"><stop offset="0" stop-color="#fde047" stop-opacity=".5"/><stop offset="1" stop-color="#fde047" stop-opacity="0"/></radialGradient>
    <radialGradient id="pStar" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fef9c3"/><stop offset=".6" stop-color="#facc15"/><stop offset="1" stop-color="#ea580c"/></radialGradient>
    <radialGradient id="pCore" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#b91c1c"/></radialGradient>
  </defs>
  <circle cx="100" cy="104" r="92" fill="url(#pHalo)"/>
  <path d="M100 4v26" stroke="${INK}" stroke-width="3"/>
  <g stroke-width="5" fill="none" stroke-linecap="round">
    <path d="M82 160q-10 20 0 34q8 10-2 20" stroke="#dc2626"/>
    <path d="M100 144q-8 26 0 44q6 14 0 26" stroke="#16a34a"/>
    <path d="M118 160q10 20 0 34q-8 10 2 20" stroke="#2563eb"/>
  </g>
  <g><circle cx="80" cy="214" r="4" fill="#dc2626"/><circle cx="100" cy="214" r="4" fill="#16a34a"/><circle cx="120" cy="214" r="4" fill="#2563eb"/></g>
  <path d="M100 28L121 81L178 84L133 118L149 174L100 142L51 174L67 118L22 84L79 81Z" fill="url(#pStar)" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
  <path d="M100 104V28M100 104L178 84M100 104L149 174M100 104L51 174M100 104L22 84" stroke="#b45309" stroke-width="2" opacity=".5"/>
  <path d="M100 56L111 89L146 91L118 112L128 146L100 126L72 146L82 112L54 91L89 89Z" fill="none" stroke="#fff" stroke-width="3" opacity=".75" stroke-linejoin="round"/>
  <circle cx="100" cy="104" r="22" fill="url(#pCore)" stroke="${INK}" stroke-width="3.5"/>
  ${eye(92, 101, 3.5, 4.5)}${eye(108, 101, 3.5, 4.5)}
  ${blush(85, 110, 4)}${blush(115, 110, 4)}
  <path d="M93 111q7 6 14 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
  <g fill="#fef08a"><path d="M170 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="M32 140l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M176 150l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></g>`);

const CHRISTMAS: Pack = {
  theme: "christmas",
  label: "Christmas",
  noun: "holiday friend",
  crowd: "Santa and friends",
  emoji: "🎅",
  bg: "from-red-950 via-emerald-950 to-black",
  prizeById: {
    melona: { id: "melona", name: "Frosty", lines: ["Cool catch! A Melona is yours!"], svg: SNOWMAN_MELONA },
    coke: { id: "coke", name: "Santa", lines: ["Ho ho ho! Cheers, a 1.5L Coke for your table!"], svg: SANTA_COKE },
    kimbap: { id: "kimbap", name: "Gingy", lines: ["You caught the gingerbread! Kimbap on me."], svg: GINGER_KIMBAP },
    enoki: { id: "enoki", name: "Rudolf", lines: ["Special delivery! Enoki rolls for you."], svg: RUDOLF_ENOKI, aspect: 240 / 200 },
    noodles: { id: "noodles", name: "Elfie", lines: ["Slurp! Huli mo ako, noodles para sa'yo!"], svg: ELF_NOODLES },
  },
  // Same words as Halloween: prizes are typed by admins, so ids are slugs.
  prizeKeywords: {
    melona: ["melona"],
    coke: ["coke", "cola"],
    kimbap: ["kimbap", "gimbap"],
    enoki: ["enoki"],
    noodles: ["noodle", "ramyeon", "ramen", "ramyun", "pancit", "mami"],
  },
  unknownPrize: { id: "gift", name: "Santa", lines: ["Ho ho ho! May regalo ka!"], svg: SANTA_GIFT },
  prizeFallback: [
    { id: "santa", name: "Santa", lines: ["Ho ho ho! You caught me!"], svg: SANTA },
    { id: "rudolf", name: "Rudolf", lines: ["My nose led you right. Prize!"], svg: RUDOLF, aspect: 240 / 200 },
    { id: "snowman", name: "Frosty", lines: ["Cool catch! A treat for you."], svg: SNOWMAN },
    { id: "ginger", name: "Gingy", lines: ["You caught the gingerbread!"], svg: GINGER },
  ],
  hello: [
    { id: "elf", name: "Elfie", lines: ["Merry Christmas from SharEat!", "Santa is somewhere here…", "Busog ka na?"], svg: ELF },
    { id: "parol", name: "Parol", lines: ["Maligayang Pasko!", "Keep looking, Santa is near.", "Refill na!"], svg: PAROL },
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
