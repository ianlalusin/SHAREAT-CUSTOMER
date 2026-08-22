"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Layers, Loader2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { getAuth } from "firebase/auth";
import { cn } from "@/lib/utils";
import { inFlightQty, type SessionOrder } from "@/hooks/use-session-orders";
import { optionGroupsFor } from "@/lib/catalog/project";
import type { CatalogCategory, CatalogEntry, CatalogOptionGroup, CatalogVariant } from "@/lib/catalog/types";

function peso(n: number) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `₱${Number(n || 0)}`;
  }
}

const ALL = "All";
const POPULAR = "Popular";
const MAX_QTY = 20;

/** One pick in an option group, as the order route expects it. */
type Pick = { groupId: string; valueId: string };

type CartLine = {
  /** Same item with the same picks merges onto one cart line. */
  key: string;
  entry: CatalogEntry;
  variant: CatalogVariant | null;
  picks: Pick[];
  picksText: string;
  unitPrice: number;
  qty: number;
  note: string;
};

function skuOf(entry: CatalogEntry, variant: CatalogVariant | null) {
  return variant ? variant.productId : entry.productId;
}

function cartKey(entry: CatalogEntry, variant: CatalogVariant | null, picks: Pick[], note: string) {
  const picked = picks.map((p) => p.valueId).sort().join("-");
  return `${skuOf(entry, variant)}|${picked}|${note.trim()}`;
}

interface CustomerCatalogProps {
  /**
   * When provided, skips the real session-authed fetch entirely and renders
   * these categories instead — used by the admin/manager "Preview" page, which
   * has no real customer session. Preview is always browse-only: there is no
   * session to send an order to.
   */
  overrideCategories?: CatalogCategory[];
  /** The table's in-flight orders, used to warn about ordering the same thing twice. */
  orders?: SessionOrder[];
  /** Called after an order is sent, so the shared history refreshes. */
  onOrderPlaced?: () => void;
}

export function CustomerCatalog({ overrideCategories, orders = [], onOrderPlaced }: CustomerCatalogProps = {}) {
  const isPreview = overrideCategories !== undefined;
  const isMobile = useIsMobile();

  const [categories, setCategories] = useState<CatalogCategory[]>(overrideCategories ?? []);
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const [activeEntry, setActiveEntry] = useState<CatalogEntry | null>(null);
  const [isLoading, setIsLoading] = useState(!isPreview);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

  const { toast } = useToast();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const canOrder = !isPreview && orderingEnabled;

  useEffect(() => {
    if (overrideCategories !== undefined) {
      setCategories(overrideCategories);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);

        const user = getAuth().currentUser;
        if (!user) {
          setCategories([]);
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

        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load catalog.");

        if (cancelled) return;
        setError(null);
        setCategories(Array.isArray(json.categories) ? json.categories : []);
        setOrderingEnabled(json.orderingEnabled === true);
        setIsLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Unable to load menu.");
        setCategories([]);
        setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [overrideCategories]);

  /**
   * Popular is a view across the menu, not a category of its own: an item keeps
   * its real category and appears here as well. Shown only when the store has
   * actually flagged something, so a branch that does not use it sees the menu
   * exactly as before.
   */
  const hasPopular = useMemo(
    () => categories.some((c) => c.items.some((i) => i.popular)),
    [categories]
  );

  const categoryNames = useMemo(
    () => [
      ALL,
      ...(hasPopular ? [POPULAR] : []),
      ...categories.map((c) => c.name).filter(Boolean),
    ],
    [categories, hasPopular]
  );

  const visible = useMemo<CatalogEntry[]>(() => {
    if (activeCategory === POPULAR) {
      return categories.flatMap((c) => c.items.filter((i) => i.popular));
    }
    const picked = activeCategory === ALL ? categories : categories.filter((c) => c.name === activeCategory);
    return picked.flatMap((c) => c.items);
  }, [categories, activeCategory]);

  useEffect(() => {
    if (activeCategory === ALL) return;
    if (!categoryNames.includes(activeCategory)) setActiveCategory(ALL);
  }, [categoryNames, activeCategory]);

  const addToCart = useCallback((line: Omit<CartLine, "key">) => {
    const key = cartKey(line.entry, line.variant, line.picks, line.note);
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + line.qty) } : l
        );
      }
      return [...prev, { ...line, key }];
    });
    setActiveEntry(null);
  }, []);

  const cartTotal = cart.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const cartCount = cart.reduce((sum, l) => sum + l.qty, 0);

  const sendOrder = useCallback(async () => {
    if (isSending || cart.length === 0) return;
    setIsSending(true);
    setSendError(null);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Please rejoin your session.");
      const idToken = await user.getIdToken();

      const res = await fetch("/api/customer/submit-addon-order", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          // One id per submission, so a retry or a double tap cannot order twice.
          clientRequestId: crypto.randomUUID(),
          items: cart.map((l) => ({
            productId: l.entry.productId,
            variantId: l.variant?.productId ?? null,
            qty: l.qty,
            note: l.note || undefined,
            modifiers: l.picks,
          })),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not send your order.");

      setCart([]);
      setIsReviewOpen(false);
      // A toast, not a banner: this confirms one action and should get out of
      // the way. Pinned under the Menu header it sat there through the rest of
      // the meal, reading as a standing notice about the menu itself.
      toast({
        title: "Sent to the kitchen",
        description: "You'll be charged when it's served.",
      });
      onOrderPlaced?.();
    } catch (e: any) {
      setSendError(e?.message || "Could not send your order.");
    } finally {
      setIsSending(false);
    }
  }, [cart, isSending, onOrderPlaced, toast]);

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-4 mb-3">
        <h2 className="text-lg sm:text-xl font-black text-zinc-900">Menu</h2>
        <p className="text-xs sm:text-sm text-zinc-500">
          {canOrder ? "Tap an item to order" : "Tap an item for details"}
        </p>
      </div>

      {!isLoading && !error && categoryNames.length > 1 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {categoryNames.map((c) => {
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
            {visible.map((entry) => (
              <EntryTile key={entry.productId} entry={entry} onOpen={() => setActiveEntry(entry)} />
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="mt-10 text-center text-sm text-muted-foreground">No items in this category.</div>
          ) : null}
        </>
      )}

      {cartCount > 0 ? (
        <div className="sticky bottom-4 z-20 mt-4">
          <Button className="w-full h-12 rounded-2xl shadow-lg" onClick={() => setIsReviewOpen(true)}>
            <ShoppingBag className="mr-2 h-4 w-4" />
            Review order ({cartCount}) · {peso(cartTotal)}
          </Button>
        </div>
      ) : null}

      <EntrySheet
        entry={activeEntry}
        isMobile={isMobile}
        canOrder={canOrder}
        orders={orders}
        onClose={() => setActiveEntry(null)}
        onAdd={addToCart}
      />

      <ReviewSheet
        open={isReviewOpen}
        isMobile={isMobile}
        cart={cart}
        total={cartTotal}
        isSending={isSending}
        error={sendError}
        onClose={() => setIsReviewOpen(false)}
        onChangeQty={(key, delta) =>
          setCart((prev) =>
            prev
              .map((l) => (l.key === key ? { ...l, qty: Math.max(0, Math.min(MAX_QTY, l.qty + delta)) } : l))
              .filter((l) => l.qty > 0)
          )
        }
        onRemove={(key) => setCart((prev) => prev.filter((l) => l.key !== key))}
        onSend={sendOrder}
      />
    </section>
  );
}

/**
 * One menu tile.
 *
 * A family shows the family name once, priced "from" its cheapest variant, with
 * a badge for how many versions it has. Before this, each variant got its own
 * tile carrying the family's name — so three Kimbap variants read as the same
 * item listed three times.
 */
function EntryTile({ entry, onOpen }: { entry: CatalogEntry; onOpen: () => void }) {
  const variantCount = entry.kind === "group" ? entry.variants?.length ?? 0 : 0;
  const isFamily = variantCount > 1;

  return (
    <button
      onClick={onOpen}
      className="group text-left rounded-2xl border bg-white shadow-sm hover:shadow-md active:scale-[0.99] transition-all overflow-hidden"
    >
      <div className="relative w-full aspect-square bg-zinc-100">
        {entry.imageUrl ? (
          <Image
            src={entry.imageUrl}
            alt={entry.displayName}
            fill
            sizes="(max-width: 640px) 25vw, (max-width: 1024px) 16vw, 12vw"
            className="object-contain bg-white"
          />
        ) : null}

        {isFamily ? (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-zinc-900/85 px-1.5 py-0.5 text-[10px] font-bold text-white">
            <Layers className="h-2.5 w-2.5" />
            {variantCount}
          </span>
        ) : null}
      </div>

      <div className="p-2">
        <div className="text-sm font-semibold leading-tight line-clamp-2">{entry.displayName}</div>
        <div className="mt-1 text-sm font-black">
          {isFamily ? <span className="text-[10px] font-bold text-zinc-500">from </span> : null}
          {peso(entry.price)}
        </div>
      </div>
    </button>
  );
}

/** The detail sheet: a Drawer on phones, a Dialog on wider screens. */
function EntrySheet({
  entry,
  isMobile,
  canOrder,
  orders,
  onClose,
  onAdd,
}: {
  entry: CatalogEntry | null;
  isMobile: boolean;
  canOrder: boolean;
  orders: SessionOrder[];
  onClose: () => void;
  onAdd: (line: Omit<CartLine, "key">) => void;
}) {
  const open = !!entry;
  const orderable = !!entry && canOrder && entry.orderable;
  const title = entry?.displayName ?? "Item";
  const blurb = orderable
    ? "Choose what you'd like, then add it to your order."
    : "Please approach our staff to order this item.";

  const body = entry ? (
    <EntryDetail entry={entry} orderable={orderable} orders={orders} onAdd={onAdd} />
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{blurb}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {orderable ? (
              blurb
            ) : (
              <span className="inline-flex rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">{blurb}</span>
            )}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Detail body, and the order flow when the item is orderable: pick a version,
 * pick modifiers, set a quantity, add a note.
 */
function EntryDetail({
  entry,
  orderable,
  orders,
  onAdd,
}: {
  entry: CatalogEntry;
  orderable: boolean;
  orders: SessionOrder[];
  onAdd: (line: Omit<CartLine, "key">) => void;
}) {
  const variants = entry.kind === "group" ? entry.variants ?? [] : [];
  const [selectedId, setSelectedId] = useState<string>(variants[0]?.productId ?? "");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  // A different item opened into the same mounted sheet: re-anchor everything.
  useEffect(() => {
    setSelectedId(variants[0]?.productId ?? "");
    setPicks([]);
    setQty(1);
    setNote("");
  }, [entry.productId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching variant can invalidate picks: "Extra Nori" exists on Signature
  // but not on Veggies. FILTER rather than clear — clearing would also throw
  // away still-valid picks and silently re-block a required group. Left
  // unhandled, the diner would be priced on a modifier the server then rejects,
  // after the review sheet already showed them a total.
  useEffect(() => {
    setPicks((prev) => {
      const allowed = new Set(groups.map((g) => g.id));
      const next = prev.filter((p) => allowed.has(p.groupId));
      return next.length === prev.length ? prev : next;
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected: CatalogVariant | null = variants.find((v) => v.productId === selectedId) ?? variants[0] ?? null;

  const imageUrl = selected?.imageUrl ?? entry.imageUrl;
  const description = selected?.description ?? entry.description;
  const basePrice = selected ? selected.price : entry.price;
  // A variant may offer modifiers the rest of its family does not, so the list
  // follows the current selection. Same resolver the order route prices with.
  const groups = optionGroupsFor(entry, selected);

  const picksTotal = useMemo(() => {
    let total = 0;
    for (const p of picks) {
      const g = groups.find((x) => x.id === p.groupId);
      const v = g?.values.find((x) => x.id === p.valueId);
      if (v) total += v.priceDelta;
    }
    return total;
  }, [picks, groups]);

  const picksText = useMemo(
    () =>
      picks
        .map((p) => groups.find((g) => g.id === p.groupId)?.values.find((v) => v.id === p.valueId)?.name)
        .filter(Boolean)
        .join(", "),
    [picks, groups]
  );

  // A required group with nothing chosen blocks the add — the server refuses it
  // anyway, so catching it here saves the diner a round trip.
  const missingRequired = groups.filter(
    (g) => g.required && !picks.some((p) => p.groupId === g.id)
  );

  const sku = selected ? selected.productId : entry.productId;
  const alreadyOrdered = inFlightQty(orders, sku);
  const variantOrderable = selected ? selected.orderable : entry.orderable;
  const canAdd = orderable && variantOrderable && missingRequired.length === 0;

  const togglePick = (group: CatalogOptionGroup, valueId: string) => {
    setPicks((prev) => {
      const isPicked = prev.some((p) => p.groupId === group.id && p.valueId === valueId);
      if (group.selectionMode === "multi") {
        return isPicked
          ? prev.filter((p) => !(p.groupId === group.id && p.valueId === valueId))
          : [...prev, { groupId: group.id, valueId }];
      }
      // Single-select: tapping the chosen value again clears it, unless the
      // group is required — where clearing would only block the add.
      const others = prev.filter((p) => p.groupId !== group.id);
      if (isPicked && !group.required) return others;
      return [...others, { groupId: group.id, valueId }];
    });
  };

  const unitPrice = basePrice + picksTotal;

  return (
    <div className="space-y-4">
      {imageUrl ? (
        <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-100">
          <Image
            src={imageUrl}
            alt={selected?.displayName ?? entry.displayName}
            fill
            sizes="(max-width: 768px) 100vw, 420px"
            className="object-cover"
          />
        </div>
      ) : null}

      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}

      {variants.length > 0 ? (
        <div>
          <div className="text-sm font-semibold mb-2">
            Choose a version <span className="font-normal text-muted-foreground">({variants.length})</span>
          </div>
          <div className="grid gap-2">
            {variants.map((v) => {
              const active = v.productId === selected?.productId;
              return (
                <button
                  key={v.productId}
                  onClick={() => setSelectedId(v.productId)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                    active ? "border-primary bg-primary/5" : "border-zinc-200 bg-white hover:bg-zinc-50"
                  )}
                >
                  <span className="text-sm font-semibold">{v.variantLabel || v.displayName}</span>
                  <span className="text-sm font-black shrink-0">{peso(v.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {orderable && groups.length > 0
        ? groups.map((group) => (
            <div key={group.id}>
              <div className="text-sm font-semibold mb-2">
                {group.name}{" "}
                <span className="font-normal text-muted-foreground">
                  {group.required ? "(required)" : group.selectionMode === "multi" ? "(choose any)" : "(optional)"}
                </span>
              </div>
              <div className="grid gap-2">
                {group.values.map((value) => {
                  const active = picks.some((p) => p.groupId === group.id && p.valueId === value.id);
                  return (
                    <button
                      key={value.id}
                      onClick={() => togglePick(group, value.id)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                        active ? "border-primary bg-primary/5" : "border-zinc-200 bg-white hover:bg-zinc-50"
                      )}
                    >
                      <span className="text-sm font-semibold">{value.name}</span>
                      {value.priceDelta !== 0 ? (
                        <span className="text-sm font-black shrink-0">
                          {value.priceDelta > 0 ? "+" : ""}
                          {peso(value.priceDelta)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        : null}

      {orderable && alreadyOrdered > 0 ? (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Someone at your table already ordered {alreadyOrdered}× this and it&apos;s still coming. Add another only
            if you really want more.
          </span>
        </div>
      ) : null}

      {orderable ? (
        <>
          <div>
            <div className="text-sm font-semibold mb-2">Quantity</div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer">
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center text-lg font-black">{qty}</span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
                aria-label="More"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">
              Special instructions <span className="font-normal text-muted-foreground">(optional)</span>
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={140}
              placeholder="e.g. no onions, extra spicy"
            />
          </div>

          {!variantOrderable ? (
            <p className="text-xs text-muted-foreground">
              This version can&apos;t be ordered from your phone — please ask our staff.
            </p>
          ) : null}

          <Button
            className="w-full h-12 rounded-2xl"
            disabled={!canAdd}
            onClick={() =>
              onAdd({
                entry,
                variant: selected,
                picks,
                picksText,
                unitPrice,
                qty,
                note: note.trim(),
              })
            }
          >
            {missingRequired.length > 0
              ? `Choose ${missingRequired[0].name}`
              : `Add to order · ${peso(unitPrice * qty)}`}
          </Button>
        </>
      ) : (
        <div>
          <div className="text-sm text-muted-foreground">{entry.subCategory}</div>
          <div className="mt-1 text-lg font-black">{peso(basePrice)}</div>
        </div>
      )}
    </div>
  );
}

/** Last look before anything reaches the kitchen. */
function ReviewSheet({
  open,
  isMobile,
  cart,
  total,
  isSending,
  error,
  onClose,
  onChangeQty,
  onRemove,
  onSend,
}: {
  open: boolean;
  isMobile: boolean;
  cart: CartLine[];
  total: number;
  isSending: boolean;
  error: string | null;
  onClose: () => void;
  onChangeQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onSend: () => void;
}) {
  const body = (
    <div className="space-y-3">
      <ul className="space-y-2">
        {cart.map((l) => (
          <li key={l.key} className="flex items-start gap-3 rounded-2xl border bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-tight">
                {l.variant?.displayName ?? l.entry.displayName}
              </div>
              {l.picksText ? <div className="mt-0.5 text-xs text-muted-foreground">{l.picksText}</div> : null}
              {l.note ? <div className="mt-0.5 text-xs italic text-muted-foreground">&ldquo;{l.note}&rdquo;</div> : null}
              <div className="mt-2 flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChangeQty(l.key, -1)} aria-label="Fewer">
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm font-black">{l.qty}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChangeQty(l.key, 1)} aria-label="More">
                  <Plus className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => onRemove(l.key)} aria-label="Remove">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="shrink-0 text-sm font-black">{peso(l.unitPrice * l.qty)}</div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm font-semibold">Total</span>
        <span className="text-lg font-black">{peso(total)}</span>
      </div>

      <p className="text-xs text-muted-foreground">
        This goes straight to the kitchen. It&apos;s added to your bill once it&apos;s served.
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button className="w-full h-12 rounded-2xl" disabled={isSending || cart.length === 0} onClick={onSend}>
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send to kitchen"}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Your order</DrawerTitle>
            <DrawerDescription>Check this over before it goes to the kitchen.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your order</DialogTitle>
          <DialogDescription>Check this over before it goes to the kitchen.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
