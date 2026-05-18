"use client";

import {
  useEffect,
  useState } from "react";
import { getAuth,
  onAuthStateChanged,
  signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
  where,
  limit,
  getDoc
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useFirebase } from "@/firebase";
import { useRouter } from "next/navigation";
import { Plus, Pencil, EyeOff, Eye, Trash2, Upload, Loader2, ArrowLeft, Link2, X as XIcon } from "lucide-react";

import { getStoreName } from "@/lib/store-directory";
type Category = { id: string; name: string; isActive: boolean; sortOrder: number };

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  isArchived?: boolean;
  linkedPosProductId?: string | null;
  linkedPosProductName?: string | null;
};

type PosProduct = { id: string; name: string; category?: string };

function toPrice(v: string) {
  const n = Number((v ?? "").toString().replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function AdminItemsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { firestore, storage } = useFirebase();


  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  const [storeId, setStoreId] = useState<string>("");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [stores, setStores] = useState<{ storeId: string; name: string }[]>([]);
  const selectedStoreName = (stores.find((s) => s.storeId === storeId)?.name || getStoreName(storeId));

  useEffect(() => {
    try { setStoreId(localStorage.getItem("admin_selected_storeId") || ""); } catch {}
  }, []);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthReady(true);
      if (!user) {
        setIsAuthed(false);
        router.replace("/admin/login");
        return;
      }
      setIsAuthed(true);

      // load assignedStoreIds from users/{uid}
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/admin/my-stores", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        const list = Array.isArray(data?.stores) ? data.stores : [];
        const ids = list.map((x: any) => String(x.storeId || "")).filter(Boolean);
        setStores(list.map((x: any) => ({ storeId: String(x.storeId || ""), name: String(x.name || x.storeId || "") })));
        setStoreIds(ids);

        // pick persisted storeId if still allowed; otherwise pick first
        let selected = "";
        try { selected = localStorage.getItem("admin_selected_storeId") || ""; } catch {}
        if (!selected || (ids.length > 0 && !ids.includes(selected))) selected = ids[0] || "";
        if (selected) {
          try { localStorage.setItem("admin_selected_storeId", selected); } catch {}
          setStoreId(selected);
        }
      } catch {}
    });
    return () => unsub();
  }, [router, firestore]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"global" | "store">("global");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive">("active");
  const [categories, setCategories] = useState<Category[]>([]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // Add form
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Add-on");
  const [price, setPrice] = useState("0");
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPrice, setEditPrice] = useState("0");
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editLinkedId, setEditLinkedId] = useState<string | null>(null);
  const [editLinkedName, setEditLinkedName] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<PosProduct[]>([]);
  const [linkSearchOpen, setLinkSearchOpen] = useState(false);
  const [linkSearchLoading, setLinkSearchLoading] = useState(false);

  useEffect(() => {
    if (!authReady || !isAuthed) return;
    const q = query(collection(firestore, "catalogItems"), orderBy("name", "asc"));
    return onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            name: String(x.name ?? ""),
            category: String(x.category ?? ""),
            price: Number(x.price ?? 0),
            imageUrl: x.imageUrl ?? null,
            isAvailable: x.isAvailable !== false,
            isArchived: x.isArchived === true,
            linkedPosProductId: x.linkedPosProductId ?? null,
            linkedPosProductName: x.linkedPosProductName ?? null,
          };
        })
      );
    });
  }, [firestore, authReady, isAuthed]);

  useEffect(() => {
    if (!authReady || !isAuthed || !storeId) {
      setStoreItems([]);
      return;
    }
    const ref = doc(firestore, "stores", storeId, "catalogCache", "main");
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() as any) : null;
      
      const arr = Array.isArray(data?.items) ? data.items : [];
      setStoreItems(arr);

    });
  }, [firestore, authReady, isAuthed, storeId]);

  useEffect(() => {
    if (!authReady || !isAuthed) return;
    const q = query(
      collection(firestore, "categories"),
      where("isActive", "==", true),
      orderBy("sortOrder", "asc"),
      orderBy("name", "asc")
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          name: String(x.name ?? ""),
          isActive: x.isActive !== false,
          sortOrder: Number(x.sortOrder ?? 0),
        };
      });
      setCategories(list);
      if (list.length > 0) {
        setCategory((cur) => (cur ? cur : list[0].name));
        setEditCategory((cur) => (cur ? cur : list[0].name));
      }
    });
  }, [firestore, authReady, isAuthed]);

  async function uploadImage(file: File, itemId: string) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `catalogImages/${itemId}/${Date.now()}-${safeName}`;
    const r = ref(storage, path);
    await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
    return await getDownloadURL(r);
  }

  async function rebuildStoreCatalogCache(storeId: string) {
    try {
      const user = getAuth().currentUser;
      if (!user || !storeId) return;
      const idToken = await user.getIdToken();
      await fetch(`/api/admin/rebuild-store-catalog-cache?storeId=${encodeURIComponent(storeId)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
    } catch {}
  }

  async function createItem() {
    setIsBusy(true);
    try {
      const p = toPrice(price);
      const docRef = await addDoc(collection(firestore, "catalogItems"), {
        name: name.trim(),
        category: category.trim(),
        price: p,
        imageUrl: null,
        isAvailable: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (imageFile) {
        const url = await uploadImage(imageFile, docRef.id);
        await updateDoc(doc(firestore, "catalogItems", docRef.id), {
          imageUrl: url,
          updatedAt: serverTimestamp(),
        });
      }

      setName("");
      setPrice("0");
      setImageFile(null);
      setIsAddOpen(false);
      toast({ title: "Added" });
      await rebuildStoreCatalogCache(storeId);
    } catch (e: any) {
      toast({ title: "Create failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleAvail(it: CatalogItem) {
    setIsBusy(true);
    try {
      await updateDoc(doc(firestore, "catalogItems", it.id), {
        isAvailable: !it.isAvailable,
        updatedAt: serverTimestamp(),
      });
      await rebuildStoreCatalogCache(storeId);
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleStoreAvail(it: any) {
    if (!storeId) return;
    setIsBusy(true);
    try {
      const cacheRef = doc(firestore, "stores", storeId, "catalogCache", "main");
      const snap = await getDoc(cacheRef);
      const data = snap.exists() ? (snap.data() as any) : null;
      const itemsArr: any[] = Array.isArray(data?.items) ? data.items : [];

      const next = itemsArr.map((x) => {
        if (String(x?.id || "") !== String(it.id)) return x;
        // store-level toggle (rebuild will enforce global disable)
        return {
          ...x,
          isAvailable: x.isAvailable === false ? true : false,
          storeUpdatedAtMs: Date.now(),
        };
      });

      await updateDoc(cacheRef, { items: next, updatedAtMs: Date.now() });
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  async function reviveStoreItem(it: any) {
    // Always show revive in store tab; fail if global is archived/disabled.
    if (!isGlobalActive(it.id)) {
      toast({ title: "Cannot revive", description: "Item is disabled in Global catalog.", variant: "destructive" });
      return;
    }
    // Ensure it becomes available in store
    if (it.isAvailable === false) {
      await toggleStoreAvail({ ...it, isAvailable: false });
    }
  }

  async function removeItem(it: CatalogItem) {
    setIsBusy(true);
    try {
      // Archive (soft delete)
      await updateDoc(doc(firestore, "catalogItems", it.id), {
        isArchived: true,
        isAvailable: false,
        updatedAt: serverTimestamp(),
      });
      await rebuildStoreCatalogCache(storeId);
    } catch (e: any) {
      toast({ title: "Archive failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  async function reviveItem(it: CatalogItem) {
    setIsBusy(true);
    try {
      await updateDoc(doc(firestore, "catalogItems", it.id), {
        isArchived: false,
        updatedAt: serverTimestamp(),
      });
      await rebuildStoreCatalogCache(storeId);
    } catch (e: any) {
      toast({ title: "Revive failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  function openEdit(it: CatalogItem) {
    setEditItem(it);
    setEditName(it.name);
    setEditCategory(it.category || (categories[0]?.name ?? "Add-on"));
    setEditPrice(String(it.price ?? 0));
    setEditImageFile(null);
    setEditLinkedId(it.linkedPosProductId ?? null);
    setEditLinkedName(it.linkedPosProductName ?? null);
    setLinkSearch("");
    setLinkResults([]);
    setLinkSearchOpen(false);
    setEditOpen(true);
  }

  // Debounced POS product search while the link picker is open.
  useEffect(() => {
    if (!editOpen) return;
    if (!linkSearchOpen) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setLinkSearchLoading(true);
        const user = getAuth().currentUser;
        if (!user) return;
        const idToken = await user.getIdToken();
        const url = `/api/admin/pos-products${linkSearch.trim() ? `?q=${encodeURIComponent(linkSearch.trim())}` : ""}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json?.ok) setLinkResults(json.products || []);
        else setLinkResults([]);
      } catch {
        if (!cancelled) setLinkResults([]);
      } finally {
        if (!cancelled) setLinkSearchLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [editOpen, linkSearchOpen, linkSearch]);

  async function saveEdit() {
    if (!editItem) return;
    setIsBusy(true);
    try {
      if (activeTab === "store") {
        if (!storeId) throw new Error("Missing store.");
        const cacheRef = doc(firestore, "stores", storeId, "catalogCache", "main");
        const snap = await getDoc(cacheRef);
        const data = snap.exists() ? (snap.data() as any) : null;
        const itemsArr: any[] = Array.isArray(data?.items) ? data.items : [];
        let nextImageUrl = editItem.imageUrl ?? null;
        if (editImageFile) {
          nextImageUrl = await uploadImage(editImageFile, editItem.id);
        }
        const next = itemsArr.map((x) => {
          if (String(x?.id || "") !== String(editItem.id)) return x;
          return {
            ...x,
            name: editName.trim(),
            category: editCategory.trim(),
            price: toPrice(editPrice),
            imageUrl: nextImageUrl,
            linkedPosProductId: editLinkedId,
            linkedPosProductName: editLinkedName,
            storeUpdatedAtMs: Date.now(),
          };
        });
        await updateDoc(cacheRef, { items: next, updatedAtMs: Date.now() });
      } else {
        const updates: any = {
          name: editName.trim(),
          category: editCategory.trim(),
          price: toPrice(editPrice),
          updatedAt: serverTimestamp(),
        };
        if (editImageFile) {
          const url = await uploadImage(editImageFile, editItem.id);
          updates.imageUrl = url;
        }
        await updateDoc(doc(firestore, "catalogItems", editItem.id), updates);
      }

      // Link save goes through a server endpoint so it uses Admin SDK and bypasses
      // the catalogItems write rule. Save changes on both the global and store tab.
      const linkChanged =
        (editItem.linkedPosProductId ?? null) !== (editLinkedId ?? null) ||
        (editItem.linkedPosProductName ?? null) !== (editLinkedName ?? null);
      if (linkChanged) {
        const user = getAuth().currentUser;
        if (user) {
          const idToken = await user.getIdToken();
          const res = await fetch("/api/admin/link-catalog-item", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({
              catalogItemId: editItem.id,
              posProductId: editLinkedId,
              posProductName: editLinkedName,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save link.");
        }
      }

      if (activeTab !== "store") {
        await rebuildStoreCatalogCache(storeId);
      }
      setEditOpen(false);
      toast({ title: "Saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  const globalActiveItems = items.filter((x) => x.isArchived !== true);
  const globalInactiveItems = items.filter((x) => x.isArchived === true);

  const storeActiveItems = storeItems.filter((x: any) => x?.isAvailable !== false);
  const storeInactiveItems = storeItems.filter((x: any) => x?.isAvailable === false);

  const globalById = new Map<string, any>(items.map((x) => [String(x.id), x]));
  const isGlobalActive = (id: any) => {
    const g = globalById.get(String(id));
    if (!g) return true; // fallback: allow revive if we can't see global
    return g.isArchived !== true && g.isAvailable !== false;
  };

  return (
    <main className="min-h-screen p-6 max-w-[980px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { if (window.history.length > 1) router.back(); else router.push("/admin"); }} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Catalog Admin</h1>
          <div className="ml-2">
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm max-w-[220px]"
              value={storeId}
              onChange={(e) => {
                const v = e.target.value;
                setStoreId(v);
                try { localStorage.setItem("admin_selected_storeId", v); } catch {}
              }}
              disabled={stores.length <= 1}
              aria-label="Select store"
            >
              {stores.length === 0 ? (
                <option value="">No store assigned</option>
              ) : (
                stores.map((s) => (
                  <option key={s.storeId} value={s.storeId}>{s.name}</option>
                ))
              )}</select>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            try { await signOut(getAuth()); } catch {}
            router.push("/");
          }}
        >
          Exit Admin
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Manage products for the public catalog.</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              setIsBusy(true);
              try {
                await rebuildStoreCatalogCache(storeId);
                toast({ title: "Cache rebuilt" });
              } catch {}
              setIsBusy(false);
            }}
            disabled={isBusy || !storeId}
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Rebuild Cache
          </Button>
          <Button
            onClick={() => setIsAddOpen((v) => !v)}
            disabled={isBusy}
            className="rounded-full h-12 w-12 p-0 bg-primary hover:bg-primary/90 shadow-lg"
            aria-label="Add item"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={activeTab === "global" ? "default" : "outline"}
          onClick={() => setActiveTab("global")}
          disabled={isBusy}
        >
          Global
        </Button>
        <Button
          variant={activeTab === "store" ? "default" : "outline"}
          onClick={() => setActiveTab("store")}
          disabled={isBusy || !storeId}
        >
          {selectedStoreName}
        </Button>
      </div>

      {isAddOpen && (
        <Card className="rounded-[2rem] overflow-hidden border-none shadow-xl bg-white">
          <CardHeader>
            <CardTitle>Add product</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={isBusy} />
            <div className="grid gap-1">
              <label className="text-sm text-muted-foreground">Category</label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isBusy}
              >
                {categories.length === 0 ? (
                  <option value="Add-on">Add-on</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))
                )}
              </select>
            </div>
            <Input placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} disabled={isBusy} />
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer border rounded-md px-3 h-10 hover:bg-zinc-50 transition-colors">
                <Upload className="h-4 w-4" />
                <span>{imageFile ? imageFile.name : "Upload image"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  disabled={isBusy}
                />
              </label>
              <div className="flex-1" />
              <Button onClick={createItem} disabled={isBusy || !name.trim()} className="min-w-[120px]">
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </Button>
              <Button variant="outline" onClick={() => setIsAddOpen(false)} disabled={isBusy}>Close</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-[2rem] border-none shadow-xl bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Products
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusFilter === "active" ? "bg-primary text-primary-foreground border-primary" : "bg-white text-zinc-600"}`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusFilter === "inactive" ? "bg-primary text-primary-foreground border-primary" : "bg-white text-zinc-600"}`}
            >
              Inactive
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(activeTab === "global"
            ? (statusFilter === "active" ? globalActiveItems : globalInactiveItems)
            : (statusFilter === "active" ? storeActiveItems : storeInactiveItems)
          ).map((it: any) => (
            <div key={it.id} className={`flex items-center justify-between border rounded-xl p-3 gap-3 transition-colors ${activeTab === "global" && it.isArchived ? "opacity-60 bg-zinc-50" : "hover:bg-zinc-50"}`}>
              <div className="h-12 w-12 rounded-lg overflow-hidden bg-zinc-100 flex items-center justify-center shrink-0 border">
                {it.imageUrl ? (
                  <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">No image</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{it.name}</div>
                <div className="text-sm text-muted-foreground">{it.category} • ₱{it.price} • {it.isAvailable ? "Available" : "Hidden"}</div>
                <div className={`mt-0.5 text-[11px] flex items-center gap-1 ${it.linkedPosProductId ? "text-emerald-700" : "text-muted-foreground/70"}`}>
                  <Link2 className="h-3 w-3" />
                  {it.linkedPosProductId ? (
                    <>
                      Linked: <span className="font-medium truncate max-w-[200px]">{it.linkedPosProductName || it.linkedPosProductId}</span>
                    </>
                  ) : (
                    "Not linked"
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => openEdit(it)} disabled={isBusy} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => (activeTab === "global" ? toggleAvail(it) : toggleStoreAvail(it))} disabled={isBusy || (activeTab === "store" && !isGlobalActive(it.id))} aria-label={it.isAvailable ? "Hide" : "Show"}>
                  {it.isAvailable ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                {activeTab === "global" ? (
                  it.isArchived ? (
                    <Button variant="outline" onClick={() => reviveItem(it)} disabled={isBusy} className="h-9">
                      Revive
                    </Button>
                  ) : (
                    <Button variant="destructive" size="icon" onClick={() => removeItem(it)} disabled={isBusy} aria-label="Archive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )
                ) : (
                  // Store tab: always show Revive for inactive items; click will validate global first
                  it.isAvailable === false ? (
                    <Button variant="outline" onClick={() => reviveStoreItem(it)} disabled={isBusy} className="h-9">
                      Revive
                    </Button>
                  ) : null
                )}
              </div>
            </div>
          ))}
          {(activeTab === "global"
            ? (statusFilter === "active" ? globalActiveItems : globalInactiveItems)
            : (statusFilter === "active" ? storeActiveItems : storeInactiveItems)
          ).length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">No items yet.</div>}
        </CardContent>
      </Card>

      <div className="pt-2">
        <Button variant="outline" onClick={() => router.push("/admin/categories")} disabled={isBusy}>Manage Categories</Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem]">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Input placeholder="Name" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={isBusy} />
            <div className="grid gap-1">
              <label className="text-sm text-muted-foreground">Category</label>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                disabled={isBusy}
              >
                {categories.length === 0 ? (
                  <option value="Add-on">Add-on</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))
                )}
              </select>
            </div>
            <Input placeholder="Price" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} disabled={isBusy} />
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer border rounded-md px-3 h-10 hover:bg-zinc-50 transition-colors">
              <Upload className="h-4 w-4" />
              <span>{editImageFile ? editImageFile.name : "Upload new image (optional)"}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setEditImageFile(e.target.files?.[0] ?? null)}
                disabled={isBusy}
              />
            </label>

            {/* Link to POS product */}
            <div className="grid gap-1">
              <label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Linked POS product
              </label>
              {editLinkedId && !linkSearchOpen ? (
                <div className="flex items-center justify-between gap-2 border rounded-md px-3 h-10 bg-zinc-50">
                  <span className="text-sm truncate">
                    <span className="font-medium">{editLinkedName || editLinkedId}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setLinkSearchOpen(true);
                        setLinkSearch("");
                      }}
                      disabled={isBusy}
                    >
                      Change
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setEditLinkedId(null);
                        setEditLinkedName(null);
                      }}
                      disabled={isBusy}
                      title="Unlink"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    placeholder="Search POS products by name…"
                    value={linkSearch}
                    onFocus={() => setLinkSearchOpen(true)}
                    onChange={(e) => {
                      setLinkSearch(e.target.value);
                      setLinkSearchOpen(true);
                    }}
                    disabled={isBusy}
                  />
                  {linkSearchOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border bg-background shadow-lg z-10">
                      {linkSearchLoading ? (
                        <div className="p-3 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin inline" />
                        </div>
                      ) : linkResults.length === 0 ? (
                        <div className="p-3 text-center text-sm text-muted-foreground">
                          {linkSearch.trim() ? "No matches" : "Start typing to search"}
                        </div>
                      ) : (
                        linkResults.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 border-b last:border-b-0"
                            onClick={() => {
                              setEditLinkedId(p.id);
                              setEditLinkedName(p.name);
                              setLinkSearchOpen(false);
                              setLinkSearch("");
                            }}
                          >
                            <div className="font-medium truncate">{p.name}</div>
                            {p.category && (
                              <div className="text-xs text-muted-foreground truncate">{p.category}</div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {linkSearchOpen && editLinkedId && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Currently linked to <span className="font-medium">{editLinkedName}</span>.{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setLinkSearchOpen(false)}
                        disabled={isBusy}
                      >
                        Keep
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isBusy}>Cancel</Button>
              <Button onClick={saveEdit} disabled={isBusy || !editItem || !editName.trim()}>
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
