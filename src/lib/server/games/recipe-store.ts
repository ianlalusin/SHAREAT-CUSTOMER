import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { buildFeed, type RankableRecipe } from "@/lib/games/recipe/feed";
import { applyVerdict, rankScore } from "@/lib/games/recipe/rank";
import { EMPTY_COUNTS, EMPTY_FEED, type RecipeCounts, type RecipeFeed, type RecipeStatus, type RecipeStep, type Verdict } from "@/lib/games/recipe/types";
import type { RecipeDraft, RecipeMode } from "@/lib/games/recipe/validate";

/**
 * Firestore for "Paano ka mag-samgyup".
 *
 * Everything here runs under the Admin SDK from an API route. The customer
 * client never touches these collections directly — partly because the live
 * ruleset lives in the POS repo and cannot be deployed from here, and partly
 * because every integrity rule in this game (one vote per person, no voting on
 * your own recipe, no brigading from your own table) is only a rule if the
 * server is the one enforcing it.
 */

export const GAME_ID = "samgyup-recipe";

/**
 * How long the feed projection may go without a rebuild.
 *
 * The trade is explicit: shorter means fresher ranks and more full scans of
 * `gameRecipes`; longer means fewer scans and a staler board. Votes never write
 * this doc — see `getFeed` — so this is the ONLY thing that caps feed writes,
 * and it is what keeps a chain-wide game off Firestore's ~1 write/sec per
 * document ceiling no matter how busy service gets. Raise it as the collection
 * grows; a recognition-only leaderboard has no real-time requirement.
 */
export const FEED_CACHE_TTL_MS = 90 * 1000;

const RECIPES = "gameRecipes";
const FEEDS = "gameFeeds";
const AUTHORS = "gameAuthors";

export type RecipeDoc = {
  id: string;
  title: string;
  displayName: string;
  authorKey: string;
  authorStoreId: string;
  authorStoreName: string;
  authorSessionId: string;
  steps: RecipeStep[];
  hasFreeText: boolean;
  status: RecipeStatus;
  counts: RecipeCounts;
  scoreSum: number;
  rankScore: number;
  featured: boolean;
  createdAtMs: number;
  publishedAtMs: number;
};

function toRecipe(id: string, x: Record<string, any>): RecipeDoc {
  const counts: RecipeCounts = {
    yuck: Number(x?.counts?.yuck || 0),
    good: Number(x?.counts?.good || 0),
    yummy: Number(x?.counts?.yummy || 0),
    total: Number(x?.counts?.total || 0),
  };
  return {
    id,
    title: String(x.title || ""),
    displayName: String(x.displayName || ""),
    authorKey: String(x.authorKey || ""),
    authorStoreId: String(x.authorStoreId || ""),
    authorStoreName: String(x.authorStoreName || ""),
    authorSessionId: String(x.authorSessionId || ""),
    steps: Array.isArray(x.steps) ? (x.steps as RecipeStep[]) : [],
    hasFreeText: !!x.hasFreeText,
    status: (x.status as RecipeStatus) || "pending",
    counts,
    scoreSum: Number(x.scoreSum || 0),
    rankScore: Number.isFinite(x.rankScore) ? Number(x.rankScore) : rankScore(counts, Number(x.scoreSum || 0)),
    featured: !!x.featured,
    createdAtMs: Number(x.createdAtMs || 0),
    publishedAtMs: Number(x.publishedAtMs || 0),
  };
}

function toRankable(r: RecipeDoc): RankableRecipe {
  return {
    id: r.id,
    title: r.title,
    displayName: r.displayName,
    storeName: r.authorStoreName,
    stepCount: r.steps.length,
    counts: r.counts,
    rankScore: r.rankScore,
    featured: r.featured,
    publishedAtMs: r.publishedAtMs,
    status: r.status,
  };
}

export async function getRecipe(db: Firestore, recipeId: string): Promise<RecipeDoc | null> {
  const snap = await db.doc(`${RECIPES}/${recipeId}`).get();
  return snap.exists ? toRecipe(snap.id, snap.data() as Record<string, any>) : null;
}

/* ------------------------------------------------------------------ feed --- */

/**
 * Read every published recipe and recompute all three shelves.
 *
 * Equality filter only, sorted in memory. Adding `.orderBy(...)` here would
 * make this a composite-index query — and index changes have to be deployed
 * from the POS repo, where a blind deploy is known to drop dozens of them.
 * Do not add one.
 */
export async function rebuildFeed(db: Firestore): Promise<RecipeFeed> {
  const snap = await db.collection(RECIPES).where("status", "==", "published").get();
  const rows = snap.docs.map((d) => toRankable(toRecipe(d.id, d.data() as Record<string, any>)));

  const feed = buildFeed(rows, Date.now());
  await db.doc(`${FEEDS}/${GAME_ID}`).set(feed, { merge: false });
  return feed;
}

/**
 * In-flight rebuild, shared across concurrent callers.
 *
 * Without this, the moment the cache expires every request that arrives before
 * the first rebuild finishes starts its OWN full scan of `gameRecipes` — a
 * stampede, and a costly one because the board is chain-wide, so it is every
 * diner at every branch rather than one store's traffic. `maxInstances: 1`
 * makes a process-local latch sufficient: there is one process to coordinate.
 */
let inFlightRebuild: Promise<RecipeFeed> | null = null;

function rebuildOnce(db: Firestore): Promise<RecipeFeed> {
  if (!inFlightRebuild) {
    inFlightRebuild = rebuildFeed(db).finally(() => {
      inFlightRebuild = null;
    });
  }
  return inFlightRebuild;
}

/**
 * The diner-facing read: one document, self-healing on a TTL.
 *
 * Modelled on `getRefillOptionsMenu` in lib/server/refill-options-cache.ts —
 * same shape, same reason. A missing or stale doc rebuilds inline rather than
 * serving nothing, so the board can never be stale-forever even if an admin
 * action that should have refreshed it failed.
 */
export async function getFeed(db: Firestore): Promise<RecipeFeed> {
  const snap = await db.doc(`${FEEDS}/${GAME_ID}`).get();
  const cache = snap.exists ? (snap.data() as any) : null;
  const updatedAtMs = Number(cache?.updatedAtMs || 0);

  if (!cache || Date.now() - updatedAtMs > FEED_CACHE_TTL_MS) {
    return rebuildOnce(db);
  }

  return {
    top: Array.isArray(cache.top) ? cache.top : [],
    fresh: Array.isArray(cache.fresh) ? cache.fresh : [],
    featured: Array.isArray(cache.featured) ? cache.featured : [],
    updatedAtMs,
  } as RecipeFeed;
}

/* --------------------------------------------------------------- publish --- */

export type PublishResult =
  | { ok: true; recipeId: string; status: RecipeStatus }
  | { ok: false; error: string; status?: number };

/**
 * Write a new recipe.
 *
 * `gameAuthors/{authorKey}` carries the author's `pendingRecipeId` so the
 * one-pending-at-a-time rule is a document read rather than a query — asking
 * `gameRecipes` for "this author's last publish" would need equality plus an
 * orderBy on another field, the one shape that demands a composite index. It is
 * the same trick lib/server/refill-cooldown.ts uses: keep an identity's state
 * on the identity's own doc.
 */
export async function publishRecipe(
  db: Firestore,
  args: {
    draft: RecipeDraft;
    mode: RecipeMode;
    authorKey: string;
    storeId: string;
    storeName: string;
    sessionId: string;
    fallbackDisplayName: string;
  }
): Promise<PublishResult> {
  const { draft, mode, authorKey, storeId, storeName, sessionId, fallbackDisplayName } = args;

  const recipeRef = db.collection(RECIPES).doc();
  const authorRef = db.doc(`${AUTHORS}/${authorKey}`);
  const nowMs = Date.now();

  // A Quick recipe carries no diner-authored text at all, so there is nothing
  // for a reviewer to catch and it goes live immediately. Anything with free
  // text waits for a human. This is the whole reason the game has a pulse
  // rather than an empty shelf on day one.
  const status: RecipeStatus = mode === "quick" ? "published" : "pending";

  try {
    await db.runTransaction(async (tx) => {
      const authorSnap = await tx.get(authorRef);
      const pendingId = String(authorSnap.data()?.pendingRecipeId || "");

      if (pendingId) {
        const pendingSnap = await tx.get(db.doc(`${RECIPES}/${pendingId}`));
        // Only a still-pending recipe blocks. A reviewed one leaves the pointer
        // behind, and that stale pointer must not lock the author out forever.
        if (pendingSnap.exists && pendingSnap.data()?.status === "pending") {
          throw Object.assign(new Error("You already have a recipe waiting for review."), {
            httpStatus: 429,
          });
        }
      }

      tx.set(recipeRef, {
        title: draft.title,
        displayName: draft.displayName || fallbackDisplayName,
        authorKey,
        authorStoreId: storeId,
        authorStoreName: storeName,
        authorSessionId: sessionId,
        steps: draft.steps,
        hasFreeText: mode === "custom",
        status,
        counts: EMPTY_COUNTS,
        scoreSum: 0,
        rankScore: rankScore(EMPTY_COUNTS, 0),
        featured: false,
        createdAtMs: nowMs,
        publishedAtMs: status === "published" ? nowMs : 0,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        authorRef,
        {
          authorKey,
          lastPublishedAtMs: nowMs,
          pendingRecipeId: status === "pending" ? recipeRef.id : "",
        },
        { merge: true }
      );
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not publish.", status: e?.httpStatus || 500 };
  }

  // A Quick recipe is live but the cached board predates it. Refresh so the
  // author sees their own recipe in Fresh the moment they land back on the list.
  if (status === "published") {
    await rebuildFeed(db).catch(() => {});
  }

  return { ok: true, recipeId: recipeRef.id, status };
}

/* ------------------------------------------------------------------ vote --- */

export type VoteResult =
  | { ok: true; counts: RecipeCounts }
  | { ok: false; error: string; status?: number };

/**
 * Record one verdict.
 *
 * Writes exactly two documents — the vote and the recipe — and NEVER the feed.
 * Recipes are chain-wide, so a feed write here would funnel every diner at every
 * branch into one document; the board is refreshed on a TTL by `getFeed`
 * instead. Contention stays scoped to a single recipe, which is self-limiting
 * and only ever a problem for one that has gone genuinely viral.
 */
export async function voteOnRecipe(
  db: Firestore,
  args: { recipeId: string; voterKey: string; verdict: Verdict; storeId: string; sessionId: string }
): Promise<VoteResult> {
  const { recipeId, voterKey, verdict, storeId, sessionId } = args;

  const recipeRef = db.doc(`${RECIPES}/${recipeId}`);
  const voteRef = recipeRef.collection("votes").doc(voterKey);

  try {
    const counts = await db.runTransaction(async (tx) => {
      const [recipeSnap, voteSnap] = await Promise.all([tx.get(recipeRef), tx.get(voteRef)]);

      if (!recipeSnap.exists) {
        throw Object.assign(new Error("That recipe is gone."), { httpStatus: 404 });
      }
      const recipe = toRecipe(recipeSnap.id, recipeSnap.data() as Record<string, any>);

      if (recipe.status !== "published") {
        throw Object.assign(new Error("That recipe is not available."), { httpStatus: 403 });
      }
      if (voteSnap.exists) {
        throw Object.assign(new Error("You have already rated this one."), { httpStatus: 409 });
      }
      if (recipe.authorKey === voterKey) {
        throw Object.assign(new Error("You cannot rate your own recipe."), { httpStatus: 403 });
      }
      // Everyone at one table shares a session. Without this, four friends can
      // put their seatmate's recipe on top of the board between courses.
      if (recipe.authorSessionId && recipe.authorSessionId === sessionId) {
        throw Object.assign(new Error("Someone at your table made this one — let others try it."), {
          httpStatus: 403,
        });
      }

      const next = applyVerdict(recipe.counts, recipe.scoreSum, verdict);

      tx.set(voteRef, { verdict, createdAtMs: Date.now(), storeId, sessionId });
      tx.update(recipeRef, {
        counts: next.counts,
        scoreSum: next.scoreSum,
        rankScore: next.rankScore,
      });

      return next.counts;
    });

    return { ok: true, counts };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not save your rating.", status: e?.httpStatus || 500 };
  }
}

export async function hasVoted(db: Firestore, recipeId: string, voterKey: string): Promise<boolean> {
  const snap = await db.doc(`${RECIPES}/${recipeId}/votes/${voterKey}`).get();
  return snap.exists;
}

/* ------------------------------------------------------------ moderation --- */

/** Equality filter only — no orderBy. Sorted in memory. See `rebuildFeed`. */
export async function listByStatus(db: Firestore, status: RecipeStatus, limit = 300): Promise<RecipeDoc[]> {
  const snap = await db.collection(RECIPES).where("status", "==", status).limit(limit).get();
  return snap.docs
    .map((d) => toRecipe(d.id, d.data() as Record<string, any>))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function countPending(db: Firestore): Promise<number> {
  const snap = await db.collection(RECIPES).where("status", "==", "pending").count().get();
  return snap.data().count;
}

export type ModerationAction = "approve" | "reject" | "hide" | "feature" | "unfeature";

/**
 * Apply an admin decision, then rebuild the board synchronously.
 *
 * The rebuild is inline and not best-effort on purpose: hiding a recipe has to
 * take it off the shelves NOW, not up to a TTL window later. These actions are
 * rare and human-paced, so they can afford the scan.
 */
export async function moderateRecipe(
  db: Firestore,
  recipeId: string,
  action: ModerationAction,
  byUid: string
): Promise<{ ok: true; status: RecipeStatus } | { ok: false; error: string; status?: number }> {
  const ref = db.doc(`${RECIPES}/${recipeId}`);

  try {
    const finalStatus = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw Object.assign(new Error("Recipe not found."), { httpStatus: 404 });

      const current = toRecipe(snap.id, snap.data() as Record<string, any>);
      const patch: Record<string, any> = {
        moderation: { reviewedByUid: byUid, reviewedAtMs: Date.now(), action },
      };

      switch (action) {
        case "approve":
          patch.status = "published";
          // First approval sets the clock; re-approving a hidden recipe keeps
          // its original date so it does not jump back to the top of Fresh.
          patch.publishedAtMs = current.publishedAtMs || Date.now();
          break;
        case "reject":
          patch.status = "rejected";
          break;
        case "hide":
          patch.status = "hidden";
          break;
        case "feature":
          patch.featured = true;
          break;
        case "unfeature":
          patch.featured = false;
          break;
      }

      tx.update(ref, patch);
      return (patch.status as RecipeStatus) || current.status;
    });

    await rebuildFeed(db).catch(() => {});
    return { ok: true, status: finalStatus };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not update.", status: e?.httpStatus || 500 };
  }
}

export { EMPTY_FEED };
