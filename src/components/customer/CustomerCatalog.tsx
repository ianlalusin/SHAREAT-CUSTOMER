"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getAuth } from "firebase/auth";
import { cn } from "@/lib/utils";

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl?: string | null;
};

function peso(n: number) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `₱${Number(n || 0)}`;
  }
}

export function CustomerCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [activeItem, setActiveItem] = useState<CatalogItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<string>("All");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);

        const user = getAuth().currentUser;
        if (!user) {
          setItems([]);
          setIsLoading(false);
          return;
        }

        const idToken = await user.getIdToken();
        const res = await fetch("/api/customer/catalog-items", {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
        });

        const jsonText = await res.text();
        let json: any = {};
        try {
          json = JSON.parse(jsonText || "{}");
        } catch {}

        console.log("[CustomerCatalog] status", res.status, "body", json);

        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load catalog.");

        if (cancelled) return;
        setError(null);
        setItems(Array.isArray(json.items) ? json.items : []);
        setIsLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Unable to load menu.");
        setItems([]);
        setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const c = String(it.category || "").trim();
      if (c) set.add(c);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filtered = useMemo(() => {
    if (activeCategory === "All") return items;
    return items.filter((it) => String(it.category || "").trim() === activeCategory);
  }, [items, activeCategory]);

  useEffect(() => {
    if (activeCategory === "All") return;
    if (!categories.includes(activeCategory)) setActiveCategory("All");
  }, [categories, activeCategory]);

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-4 mb-3">
        <h2 className="text-lg sm:text-xl font-black text-zinc-900">Menu</h2>
        <p className="text-xs sm:text-sm text-zinc-500">Tap an item for details</p>
      </div>

      {!isLoading && !error && categories.length > 1 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => {
            const active = c === activeCategory;
            return (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-bold border transition-colors",
                  active ? "bg-primary text-white border-primary" : "bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50"
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      ) : null}

      {isLoading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
            {filtered.map((it) => (
              <button
                key={it.id}
                onClick={() => setActiveItem(it)}
                className="group text-left rounded-2xl border bg-white shadow-sm hover:shadow-md active:scale-[0.99] transition-all overflow-hidden"
              >
                <div className="relative w-full aspect-square bg-zinc-100">
                  {it.imageUrl ? (
                    <Image
                      src={it.imageUrl}
                      alt={it.name}
                      fill
                      sizes="(max-width: 640px) 25vw, (max-width: 1024px) 16vw, 12vw"
                      className="object-contain bg-white"
                    />
                  ) : null}
                </div>

                <div className="p-2">
                  <div className="text-sm font-semibold leading-tight line-clamp-2">{it.name}</div>
                  <div className="mt-1 text-sm font-black">{peso(it.price)}</div>
                </div>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="mt-10 text-center text-sm text-muted-foreground">No items in this category.</div>
          ) : null}
        </>
      )}

      <Dialog open={!!activeItem} onOpenChange={(o) => !o && setActiveItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{activeItem?.name ?? "Item"}</DialogTitle>
            <DialogDescription>
              <span className="inline-flex rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                Please approach our staff to order this item.
              </span>
            </DialogDescription>
          </DialogHeader>

          {activeItem ? (
            <div className="space-y-3">
              {activeItem.imageUrl ? (
                <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-100">
                  <Image
                    src={activeItem.imageUrl}
                    alt={activeItem.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 420px"
                    className="object-cover"
                  />
                </div>
              ) : null}

              <div>
                <div className="text-sm text-muted-foreground">{activeItem.category}</div>
                <div className="mt-1 text-lg font-black">{peso(activeItem.price)}</div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
