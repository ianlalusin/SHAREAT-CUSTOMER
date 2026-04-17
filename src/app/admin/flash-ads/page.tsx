"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import { useRouter } from "next/navigation";

import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  Megaphone,
  Save,
  Trash2,
  Upload,
  ExternalLink,
  X,
  Pencil,
  Copy,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

type FlashAdDoc = {
  id: string;
  imageUrl: string;
  imagePath: string;
  clickBehavior: "close" | "redirect";
  redirectUrl: string | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

function fmtDate(ms?: number) {
  if (!ms) return "-";
  try { return new Date(ms).toLocaleString(); } catch { return String(ms); }
}

export default function FlashAdsPage() {
  const router = useRouter();
  const { firestore, storage } = useFirebase();
  const { toast } = useToast();

  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<{ storeId: string; name: string }[]>([]);

  // All ads from Firestore
  const [ads, setAds] = useState<FlashAdDoc[]>([]);
  const [loadingAds, setLoadingAds] = useState(true);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null); // null = create new
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [clickBehavior, setClickBehavior] = useState<"close" | "redirect">("close");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [active, setActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // The ad being edited (if any)
  const editingAd = editingId ? ads.find((a) => a.id === editingId) ?? null : null;

  // Auth guard
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

      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/admin/my-stores", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        const list: { storeId: string; name: string }[] = Array.isArray(data?.stores) ? data.stores : [];
        setStores(list.map((x: any) => ({ storeId: String(x.storeId || ""), name: String(x.name || x.storeId || "") })));

        const ids = list.map((x) => x.storeId).filter(Boolean);
        let selected = "";
        try { selected = localStorage.getItem("admin_selected_storeId") || ""; } catch {}
        if (!selected || !ids.includes(selected)) selected = ids[0] || "";
        if (selected) {
          try { localStorage.setItem("admin_selected_storeId", selected); } catch {}
          setStoreId(selected);
        }
      } catch {}
    });
    return () => unsub();
  }, [router]);

  // Listen to all flash ads
  useEffect(() => {
    if (!authReady || !isAuthed || !storeId) {
      setLoadingAds(false);
      return;
    }
    setLoadingAds(true);
    const q = query(
      collection(firestore, "stores", storeId, "flashAds"),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(
      q,
      (snap) => {
        const list: FlashAdDoc[] = snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            imageUrl: x.imageUrl || "",
            imagePath: x.imagePath || "",
            clickBehavior: x.clickBehavior === "redirect" ? "redirect" : "close",
            redirectUrl: x.redirectUrl || null,
            active: x.active === true,
            createdAt: Number(x.createdAt || 0),
            updatedAt: Number(x.updatedAt || 0),
          };
        });
        setAds(list);
        setLoadingAds(false);
      },
      () => {
        setAds([]);
        setLoadingAds(false);
      }
    );
  }, [authReady, isAuthed, storeId, firestore]);

  function handleStoreChange(id: string) {
    setStoreId(id);
    try { localStorage.setItem("admin_selected_storeId", id); } catch {}
    setAds([]);
    resetForm();
    setLoadingAds(true);
  }

  function resetForm() {
    setEditingId(null);
    setImageFile(null);
    setClickBehavior("close");
    setRedirectUrl("");
    setActive(true);
  }

  function loadAdIntoForm(ad: FlashAdDoc) {
    setEditingId(ad.id);
    setImageFile(null);
    setClickBehavior(ad.clickBehavior);
    setRedirectUrl(ad.redirectUrl || "");
    setActive(ad.active);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function duplicateAd(ad: FlashAdDoc) {
    setEditingId(null); // create mode
    setImageFile(null);
    setClickBehavior(ad.clickBehavior);
    setRedirectUrl(ad.redirectUrl || "");
    setActive(true);
    toast({ title: "Duplicating ad", description: "Loaded settings from existing ad. Upload a new image or save to reuse the same one." });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadAdImage(file: File): Promise<{ url: string; path: string }> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `flashAdImages/${storeId}/${Date.now()}-${safeName}`;
    const r = ref(storage, path);
    await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
    const url = await getDownloadURL(r);
    return { url, path };
  }

  async function handleSave() {
    if (!storeId) return;

    const isCreate = !editingId;
    const existingAd = editingAd;

    if (isCreate && !imageFile) {
      toast({ title: "Image required", description: "Please select an image to upload.", variant: "destructive" });
      return;
    }
    if (clickBehavior === "redirect" && !redirectUrl.trim()) {
      toast({ title: "URL required", description: "Please enter a redirect URL.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      let imageUrl = existingAd?.imageUrl || "";
      let imagePath = existingAd?.imagePath || "";

      if (imageFile) {
        // Delete old image if replacing an existing ad
        if (existingAd?.imagePath) {
          try { await deleteObject(ref(storage, existingAd.imagePath)); } catch {}
        }
        const uploaded = await uploadAdImage(imageFile);
        imageUrl = uploaded.url;
        imagePath = uploaded.path;
      }

      const adData = {
        imageUrl,
        imagePath,
        clickBehavior,
        redirectUrl: clickBehavior === "redirect" ? redirectUrl.trim() : null,
        active,
        updatedAt: Date.now(),
      };

      if (isCreate) {
        await addDoc(collection(firestore, "stores", storeId, "flashAds"), {
          ...adData,
          createdAt: Date.now(),
        });
        toast({ title: "Flash ad created" });
      } else {
        await updateDoc(doc(firestore, "stores", storeId, "flashAds", editingId!), adData);
        toast({ title: "Flash ad updated" });
      }

      resetForm();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(ad: FlashAdDoc) {
    if (!window.confirm("Delete this flash ad? This cannot be undone.")) return;
    setDeletingId(ad.id);
    try {
      if (ad.imagePath) {
        try { await deleteObject(ref(storage, ad.imagePath)); } catch {}
      }
      await deleteDoc(doc(firestore, "stores", storeId, "flashAds", ad.id));
      if (editingId === ad.id) resetForm();
      toast({ title: "Flash ad deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActive(ad: FlashAdDoc) {
    setTogglingId(ad.id);
    try {
      await updateDoc(doc(firestore, "stores", storeId, "flashAds", ad.id), {
        active: !ad.active,
        updatedAt: Date.now(),
      });
    } catch (e: any) {
      toast({ title: "Toggle failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  }

  const selectedStoreName = stores.find((s) => s.storeId === storeId)?.name || storeId;
  const activeAdsCount = ads.filter((a) => a.active).length;

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-[800px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Megaphone className="h-6 w-6" /> Flash Ads
          </h1>
          <p className="text-sm text-zinc-500 font-medium">Configure promotional ads shown to customers</p>
        </div>
      </div>

      {/* Store selector */}
      {stores.length > 1 && (
        <Select value={storeId} onValueChange={handleStoreChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select store" />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.storeId} value={s.storeId}>
                {s.name || s.storeId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {stores.length === 1 && (
        <p className="text-sm text-zinc-500">Store: <b>{selectedStoreName}</b></p>
      )}

      {!storeId && stores.length === 0 && (
        <p className="text-sm text-zinc-400">No stores assigned.</p>
      )}

      {storeId && (
        <>
          {/* ─── Create / Edit Form ─���─ */}
          <Card className="rounded-2xl border-none shadow-xl bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-black">
                {editingId ? "Edit Flash Ad" : "Create New Ad"}
              </CardTitle>
              {editingId && (
                <Button variant="ghost" size="sm" onClick={resetForm} className="text-xs gap-1">
                  <X className="h-3 w-3" /> Cancel Edit
                </Button>
              )}
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Current image preview (when editing) */}
              {editingAd?.imageUrl && !imageFile && (
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-zinc-600">Current Image</Label>
                  <div className="relative rounded-xl overflow-hidden border bg-zinc-50">
                    <img
                      src={editingAd.imageUrl}
                      alt="Flash ad"
                      className="w-full max-h-[250px] object-contain"
                    />
                    <Badge
                      className="absolute top-2 right-2 rounded-lg"
                      variant={editingAd.active ? "default" : "secondary"}
                    >
                      {editingAd.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Image upload */}
              <div className="space-y-2">
                <Label className="text-sm font-bold text-zinc-600">
                  {editingId ? "Replace Image" : "Ad Image"}
                </Label>
                <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/50 hover:bg-zinc-50 transition-colors">
                  <Upload className="h-5 w-5 text-zinc-400 flex-shrink-0" />
                  <span className="text-sm text-zinc-500 truncate">
                    {imageFile ? imageFile.name : "Choose image..."}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                  {imageFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7"
                      onClick={(e) => { e.preventDefault(); setImageFile(null); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </label>
              </div>

              {/* Click behavior */}
              <div className="space-y-2">
                <Label className="text-sm font-bold text-zinc-600">On Click Behavior</Label>
                <Select
                  value={clickBehavior}
                  onValueChange={(v) => setClickBehavior(v as "close" | "redirect")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="close">
                      <span className="flex items-center gap-2">
                        <X className="h-4 w-4" /> Close (dismiss ad)
                      </span>
                    </SelectItem>
                    <SelectItem value="redirect">
                      <span className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" /> Redirect to URL
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Redirect URL */}
              {clickBehavior === "redirect" && (
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-zinc-600">Redirect URL</Label>
                  <Input
                    value={redirectUrl}
                    onChange={(e) => setRedirectUrl(e.target.value)}
                    placeholder="https://example.com/promo"
                    type="url"
                  />
                </div>
              )}

              {/* Active toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-sm font-bold text-zinc-600">Active</Label>
                  <p className="text-xs text-zinc-400">Show this ad to customers</p>
                </div>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>

              {/* Save */}
              <Button
                className="w-full gap-2 font-black"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingId ? "Update Ad" : "Create Ad"}
              </Button>
            </CardContent>
          </Card>

          {/* ─── All Ads Table ─── */}
          <Card className="rounded-2xl border-none shadow-xl overflow-hidden bg-white">
            <CardHeader>
              <div className="space-y-1">
                <CardTitle className="text-lg font-black">All Ads</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className="rounded-xl" variant="default">Active: {activeAdsCount}</Badge>
                  <Badge className="rounded-xl" variant="secondary">Total: {ads.length}</Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loadingAds ? (
                <div className="p-10 flex items-center justify-center gap-2 text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading ads...
                </div>
              ) : ads.length === 0 ? (
                <div className="p-10 text-center text-zinc-400">
                  No flash ads yet. Create one above.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-zinc-600">
                      <tr>
                        <th className="text-left px-4 py-3 font-black">Image</th>
                        <th className="text-left px-4 py-3 font-black">Behavior</th>
                        <th className="text-left px-4 py-3 font-black">Status</th>
                        <th className="text-left px-4 py-3 font-black">Created</th>
                        <th className="text-right px-4 py-3 font-black">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ads.map((ad) => (
                        <tr
                          key={ad.id}
                          className={`hover:bg-zinc-50/60 ${editingId === ad.id ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
                        >
                          <td className="px-4 py-3">
                            {ad.imageUrl ? (
                              <img
                                src={ad.imageUrl}
                                alt="Ad"
                                className="h-14 w-20 object-cover rounded-lg border"
                              />
                            ) : (
                              <div className="h-14 w-20 rounded-lg border bg-zinc-100 flex items-center justify-center text-zinc-300 text-xs">
                                No img
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium capitalize">{ad.clickBehavior}</span>
                              {ad.clickBehavior === "redirect" && ad.redirectUrl && (
                                <span className="text-xs text-zinc-400 truncate max-w-[140px]" title={ad.redirectUrl}>
                                  {ad.redirectUrl}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="rounded-xl" variant={ad.active ? "default" : "secondary"}>
                              {ad.active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                            {fmtDate(ad.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {/* Toggle active */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => toggleActive(ad)}
                                disabled={togglingId === ad.id}
                                title={ad.active ? "Deactivate" : "Activate"}
                              >
                                {togglingId === ad.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : ad.active ? (
                                  <ToggleRight className="h-4 w-4 text-green-600" />
                                ) : (
                                  <ToggleLeft className="h-4 w-4 text-zinc-400" />
                                )}
                              </Button>

                              {/* Edit */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => loadAdIntoForm(ad)}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              {/* Duplicate */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => duplicateAd(ad)}
                                title="Duplicate as new ad"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>

                              {/* Delete */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-700"
                                onClick={() => handleDelete(ad)}
                                disabled={deletingId === ad.id}
                                title="Delete"
                              >
                                {deletingId === ad.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
