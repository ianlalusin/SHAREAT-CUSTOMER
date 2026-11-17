"use client";

import Link from "next/link";
import { getAuth, signOut } from "firebase/auth";
import { Eye, Gamepad2, Gift, Image as ImageIcon, KeyRound, LogOut, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ManagerHeader } from "@/components/admin/ManagerHeader";
import { useStoreScope } from "@/components/admin/StoreScope";

/**
 * The manager hub.
 *
 * Exactly the five things a branch runs on the customer app. Anything
 * chain-wide — switching a game off everywhere, rebuilding the shared recipe
 * board, the product catalog — lives on /admin and is not linked from here,
 * because it is not a decision one branch gets to make for the others.
 */
const TILES = [
  { href: "/manager/pins", label: "Table PINs", hint: "See and clear this branch", icon: KeyRound },
  { href: "/manager/feedback", label: "Feedback", hint: "What diners said", icon: MessageSquare },
  { href: "/manager/ads", label: "Flash Ads", hint: "What shows on the hub", icon: ImageIcon },
  { href: "/manager/games", label: "Games", hint: "On or off, here", icon: Gamepad2 },
  { href: "/manager/ghost-hunt", label: "Christmas Hunt", hint: "Winners & cashier PIN", icon: Gift },
  { href: "/manager/preview", label: "Preview", hint: "What a diner sees", icon: Eye },
];

export default function ManagerHubPage() {
  const { storeName } = useStoreScope();

  return (
    <main className="mx-auto min-h-screen max-w-[560px] space-y-6 p-6">
      <ManagerHeader title="Manager" subtitle={`Your branch tools for ${storeName}`} backHref={null} />

      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="flex flex-col gap-1 rounded-[1.75rem] bg-white p-5 shadow-md transition hover:shadow-lg active:scale-[0.99]"
          >
            <t.icon className="h-7 w-7 text-primary" />
            <span className="mt-1 font-black leading-tight">{t.label}</span>
            <span className="text-xs text-muted-foreground">{t.hint}</span>
          </Link>
        ))}
      </div>

      <Button
        variant="ghost"
        className="w-full rounded-2xl text-muted-foreground"
        onClick={async () => {
          await signOut(getAuth());
          window.location.href = "/admin/login";
        }}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </Button>
    </main>
  );
}
