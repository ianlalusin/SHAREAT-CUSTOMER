"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, serverTimestamp } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Trash2, EyeOff, Eye, ArrowLeft, Pencil, X } from "lucide-react";

type Category = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export default function AdminCategoriesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { firestore } = useFirebase();

  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("1000");
  const [isBusy, setIsBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("1000");

  useEffect(() => {
    const q = query(collection(firestore, "categories"), orderBy("sortOrder", "asc"), orderBy("name", "asc"));
    return onSnapshot(q, (snap) => {
      setCats(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            name: String(x.name ?? ""),
            isActive: x.isActive !== false,
            sortOrder: Number(x.sortOrder ?? 0),
          };
        })
      );
    });
  }, [firestore]);

  async function addCategory() {
    setIsBusy(true);
    try {
      const so = Number(sortOrder || 0);
      await addDoc(collection(firestore, "categories"), {
        name: name.trim(),
        isActive: true,
        sortOrder: Number.isFinite(so) ? so : 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setName("");
      setSortOrder("1000");
      toast({ title: "Category added" });
    } catch (e: any) {
      toast({ title: "Add failed", description: e?.message ?? "Check rules.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  function openEdit(c: Category) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditSortOrder(String(c.sortOrder ?? 1000));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditSortOrder("1000");
  }

  async function saveEdit(c: Category) {
    setIsBusy(true);
    try {
      const so = Number(editSortOrder || 0);
      await updateDoc(doc(firestore, "categories", c.id), {
        name: editName.trim(),
        sortOrder: Number.isFinite(so) ? so : 1000,
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Saved" });
      cancelEdit();
    } catch (e: any) {
      toast({ title: "Save failed", description: (e && e.message) ? e.message : "Check rules.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleActive(c: Category) {
    setIsBusy(true);
    try {
      await updateDoc(doc(firestore, "categories", c.id), {
        isActive: !c.isActive,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message ?? "Check rules.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  async function remove(c: Category) {
    setIsBusy(true);
    try {
      await deleteDoc(doc(firestore, "categories", c.id));
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message ?? "Check rules.", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-[980px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => router.push("/admin/items")} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Categories</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add category</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input placeholder="Category name (e.g. Noodles)" value={name} onChange={(e) => setName(e.target.value)} disabled={isBusy} />
          <Input placeholder="Sort order (0..)" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ""))} disabled={isBusy} />
          <Button onClick={addCategory} disabled={isBusy || !name.trim()}>
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add category"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>List</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {cats.map((c) => (<div key={c.id} className="flex items-center justify-between border rounded-xl p-3 gap-3">
              <div className="min-w-0 flex-1">
                {editingId === c.id ? (
                  <div className="grid gap-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={isBusy} />
                    <Input
                      value={editSortOrder}
                      onChange={(e) => setEditSortOrder(e.target.value.replace(/[^\d]/g, ""))}
                      disabled={isBusy}
                      placeholder="Sort order"
                    />
                    <div className="text-xs text-muted-foreground">Current: {c.name} • Sort: {c.sortOrder}</div>
                  </div>
                ) : (
                  <>
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-sm text-muted-foreground">Sort: {c.sortOrder} • {c.isActive ? "Active" : "Hidden"}</div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editingId === c.id ? (
                  <>
                    <Button
                      onClick={() => saveEdit(c)}
                      disabled={isBusy || !editName.trim()}
                      className="rounded-xl"
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                    <Button variant="outline" size="icon" onClick={cancelEdit} disabled={isBusy} aria-label="Cancel edit">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="icon" onClick={() => openEdit(c)} disabled={isBusy} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => toggleActive(c)} disabled={isBusy} aria-label={c.isActive ? "Hide" : "Show"}>
                      {c.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => remove(c)} disabled={isBusy} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
          {cats.length === 0 && <div className="text-sm text-muted-foreground">No categories yet.</div>}
        </CardContent>
      </Card>
    </main>
  );
}
