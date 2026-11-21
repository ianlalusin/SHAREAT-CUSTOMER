"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { Camera, Eye, Gamepad2, KeyRound, LayoutGrid, LogOut, Megaphone, MessageSquare, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * The admin hub.
 *
 * It used to carry a live PIN Registry table of its own: the newest 200 PINs
 * across EVERY branch, read with a client-side query, plus a per-row delete.
 * Both were refused by the live rules — `pinRegistry` is
 * `create, update, delete: if false` for everyone, and an unfiltered list is
 * denied for anyone but an admin — so the delete button could never have
 * worked. That table is gone; PINs now live on /admin/pins, branch by branch,
 * served by Admin-SDK routes that actually can read and delete them.
 *
 * Who may be here at all is decided by the layout, not by this page.
 */
const TILES = [
  { href: "/admin/pins", label: "Table PINs", icon: KeyRound },
  { href: "/admin/feedback", label: "Feedbacks", icon: MessageSquare },
  { href: "/admin/flash-ads", label: "Flash Ads", icon: Megaphone },
  { href: "/admin/preview", label: "Preview", icon: Eye },
  { href: "/admin/games", label: "Games", icon: Gamepad2, badge: "games" as const },
  { href: "/admin/capture-share", label: "Guest photos", icon: Camera },
  { href: "/admin/categories", label: "Categories", icon: LayoutGrid },
  { href: "/admin/privacy-cleanup", label: "Privacy cleanup", icon: ShieldCheck },
];

export default function AdminHomePage() {
  const router = useRouter();
  const [gamesPending, setGamesPending] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (user) => {
      if (!user) return;
      // Best-effort: the badge is a nudge, not something this page depends on.
      user
        .getIdToken()
        .then((t) => fetch("/api/admin/games", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }))
        .then((r) => r.json())
        .then((j) => setGamesPending(Number(j?.pendingCount || 0)))
        .catch(() => {});
    });
    return () => unsub();
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-[720px] space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Admin</h1>
          <p className="text-sm font-medium text-zinc-500">Chain-wide tools. Branch tools are on /manager.</p>
        </div>

        <Button
          variant="outline"
          className="h-11 gap-2 rounded-xl"
          onClick={async () => {
            try {
              await signOut(getAuth());
            } catch {
              /* best-effort; the redirect is what matters */
            }
            router.push("/");
          }}
        >
          <LogOut className="h-4 w-4" />
          Exit
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <Button
            key={t.href}
            variant="outline"
            onClick={() => router.push(t.href)}
            className="h-24 flex-col gap-1.5 rounded-2xl text-sm font-black sm:h-20 sm:flex-row sm:gap-3 sm:text-base"
          >
            <t.icon className="h-5 w-5" />
            {t.label}
            {/* Recipes in a diner's own words stay invisible until someone
                approves them, so the count has to nag from here — a queue
                nobody opens is a game that looks dead. */}
            {t.badge === "games" && gamesPending > 0 && (
              <Badge className="rounded-xl" variant="destructive">
                {gamesPending}
              </Badge>
            )}
          </Button>
        ))}
      </div>
    </main>
  );
}
