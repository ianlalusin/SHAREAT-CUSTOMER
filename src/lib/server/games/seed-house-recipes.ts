import type { Firestore } from "firebase-admin/firestore";
import { EMPTY_COUNTS } from "@/lib/games/recipe/types";
import { rankScore } from "@/lib/games/recipe/rank";
import { rebuildFeed } from "./recipe-store";

/**
 * House recipes, published under SharEat's own name.
 *
 * WHY: the board opens empty, and a user-generated feed that opens empty never
 * recovers — the first diner finds nothing worth trying, rates nothing, and
 * adds nothing. These give the first visitor something to try and something to
 * beat, on day one, before a single customer has written anything.
 *
 * Idempotent: the ids are fixed, so seeding twice replaces rather than
 * duplicates. Removing them is a clean undo — they are the only recipes with
 * `authorKey === HOUSE_KEY`.
 */

export const HOUSE_KEY = "house_shareat";
const SEED_PREFIX = "seed_samgyup_";

type Seed = { slug: string; title: string; steps: { itemName: string; note?: string }[] };

const SEEDS: Seed[] = [
  {
    slug: "classic",
    title: "The Classic Wrap",
    steps: [
      { itemName: "Lettuce", note: "One leaf, flat on your palm" },
      { itemName: "Pork Belly", note: "Grill until the edges crisp" },
      { itemName: "Garlic", note: "One slice, grilled soft" },
      { itemName: "Ssamjang", note: "A small dab, not a spoonful" },
      { itemName: "Rice", note: "A little, for balance" },
    ],
  },
  {
    slug: "spicy",
    title: "For the Brave",
    steps: [
      { itemName: "Spicy Pork", note: "Let it caramelise" },
      { itemName: "Kimchi", note: "Grill it beside the meat" },
      { itemName: "Cheese Dip", note: "The whole point — it cools the burn" },
      { itemName: "Lettuce", note: "Wrap it all before it cools" },
    ],
  },
  {
    slug: "cheese",
    title: "Cheese Everything",
    steps: [
      { itemName: "Beef Bulgogi" },
      { itemName: "Cheese Dip", note: "Drag it through twice" },
      { itemName: "Corn", note: "Straight from the cheese ring" },
      { itemName: "Lettuce" },
    ],
  },
  {
    slug: "beginner",
    title: "Beginner Friendly",
    steps: [
      { itemName: "Pork Belly", note: "Cut it small first" },
      { itemName: "Rice" },
      { itemName: "Ssamjang", note: "Go light until you know it" },
    ],
  },
  {
    slug: "sweet-savory",
    title: "The Sweet & Savory",
    steps: [
      { itemName: "Beef Bulgogi", note: "Sweet side first" },
      { itemName: "Kimchi", note: "The sharp counterweight" },
      { itemName: "Lettuce" },
      { itemName: "Sesame Oil", note: "One quick dip" },
    ],
  },
  {
    slug: "grill-master",
    title: "Grill Master's Way",
    steps: [
      { itemName: "Pork Belly", note: "Fat side down, do not move it" },
      { itemName: "Mushroom", note: "In the rendered fat" },
      { itemName: "Garlic", note: "Same fat, until golden" },
      { itemName: "Lettuce" },
      { itemName: "Ssamjang" },
    ],
  },
];

export async function seedHouseRecipes(db: Firestore): Promise<{ seeded: number }> {
  const nowMs = Date.now();
  const batch = db.batch();

  SEEDS.forEach((s, i) => {
    batch.set(
      db.doc(`gameRecipes/${SEED_PREFIX}${s.slug}`),
      {
        title: s.title,
        displayName: "SharEat Kitchen",
        authorKey: HOUSE_KEY,
        authorStoreId: "",
        // A house recipe belongs to no branch. Stamping the author's name here
        // too made every card read "SharEat Kitchen &middot; SharEat Kitchen".
        authorStoreName: "",
        // No session, so the "someone at your table made this" guard never
        // fires on a house recipe — every diner can rate them.
        authorSessionId: "",
        steps: s.steps.map((st) => ({
          kind: "free",
          itemName: st.itemName,
          ...(st.note ? { note: st.note } : {}),
        })),
        hasFreeText: true,
        status: "published",
        counts: EMPTY_COUNTS,
        scoreSum: 0,
        rankScore: rankScore(EMPTY_COUNTS, 0),
        featured: i === 0,
        // Staggered so Fresh has a stable order rather than an arbitrary one.
        createdAtMs: nowMs - i * 1000,
        publishedAtMs: nowMs - i * 1000,
      },
      { merge: true }
    );
  });

  await batch.commit();
  await rebuildFeed(db);
  return { seeded: SEEDS.length };
}

export async function removeHouseRecipes(db: Firestore): Promise<{ removed: number }> {
  const snap = await db.collection("gameRecipes").where("authorKey", "==", HOUSE_KEY).get();
  for (const d of snap.docs) {
    const votes = await d.ref.collection("votes").get();
    for (const v of votes.docs) await v.ref.delete();
    await d.ref.delete();
  }
  await rebuildFeed(db);
  return { removed: snap.size };
}
