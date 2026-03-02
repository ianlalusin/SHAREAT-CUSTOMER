"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
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
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useFirebase } from "@/firebase";
import { useRouter } from "next/navigation";
import { Plus, Pencil, EyeOff, Eye, Trash2, Upload, Loader2, ArrowLeft } from "lucide-react";

type Category = { id: string; name: string; isActive: boolean; sortOrder: number };

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
};

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
    });
    return () => unsub();
  }, [router]);
  const [items, setItems] = useState<CatalogItem[]>([]);
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
          };
        })
      );
    });
  }, [firestore, authReady, isAuthed]);

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

  async function rebuildGlobalCatalogCache() {
    try {
      const user = getAuth().currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();
      await fetch("/api/admin/rebuild-global-catalog-cache", {
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
      await rebuildGlobalCatalogCache();
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
      await rebuildGlobalCatalogCache();
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  async function removeItem(it: CatalogItem) {
    setIsBusy(true);
    try {
      await deleteDoc(doc(firestore, "catalogItems", it.id));
      await rebuildGlobalCatalogCache();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
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
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editItem) return;
    setIsBusy(true);
    try {
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
      setEditOpen(false);
      toast({ title: "Saved" });
      await rebuildGlobalCatalogCache();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-[980px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { if (window.history.length > 1) router.back(); else router.push("/admin"); }} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Catalog Admin</h1>
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
        <Button
          onClick={() => setIsAddOpen((v) => !v)}
          disabled={isBusy}
          className="rounded-full h-12 w-12 p-0 bg-primary hover:bg-primary/90 shadow-lg"
          aria-label="Add item"
        >
          <Plus className="h-6 w-6" />
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
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between border rounded-xl p-3 gap-3 hover:bg-zinc-50 transition-colors">
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
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => openEdit(it)} disabled={isBusy} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => toggleAvail(it)} disabled={isBusy} aria-label={it.isAvailable ? "Hide" : "Show"}>
                  {it.isAvailable ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="destructive" size="icon" onClick={() => removeItem(it)} disabled={isBusy} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">No items yet.</div>}
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
