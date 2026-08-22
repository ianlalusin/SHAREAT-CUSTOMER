import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveGameCaller } from "@/lib/server/games/auth";
import { getFeed } from "@/lib/server/games/recipe-store";

export const runtime = "nodejs";

/** The three shelves. One document read on the warm path — see FEED_CACHE_TTL_MS. */
export async function GET(req: Request) {
  try {
    const caller = await resolveGameCaller(req);
    const feed = await getFeed(getAdminDb());
    return NextResponse.json({ ok: true, feed, canPlay: caller.tier === "player" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not load the board." }, { status: 500 });
  }
}
