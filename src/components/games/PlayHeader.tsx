"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function PlayHeader({ title, subtitle, backHref }: { title: string; subtitle?: string; backHref: string }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          aria-label="Go back"
          className="h-10 w-10 -ml-2 shrink-0 rounded-full flex items-center justify-center hover:bg-zinc-100 active:scale-95 transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-black text-lg leading-tight truncate">{title}</h1>
          {subtitle ? <p className="text-xs text-muted-foreground truncate">{subtitle}</p> : null}
        </div>
      </div>
    </header>
  );
}
