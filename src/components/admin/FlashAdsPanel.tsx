"use client";

import { useEffect, useState } from "react";
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
  Loader2,
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
/**
 * One branch's flash ads: create, edit, toggle, delete.
 *
 * Rendered by both `/admin/flash-ads` and `/manager/ads`. The branch arrives as
 * a prop — the shell resolved it once — and the parent mounts this with
 * `key={storeId}` so switching branch remounts it rather than leaving a
 * half-edited form pointing at the wrong store.
 *
 * Writes go straight to `stores/{storeId}/flashAds` from the client. That is
 * safe here and only here: POS's live rules gate that path on
 * `hasStoreAccess(storeId)`, read from this staff member's own `staff/{uid}`
 * document, so the database refuses a branch they are not assigned to.
 */
export function FlashAdsPanel({ storeId }: { storeId: string }) {
  const { firestore, storage } = useFirebase();
  const { toast } = useToast();

  // All ads from Firestore
  const [ads, setAds] = useState<FlashAdDoc[]>([]);
  const [loadingAds, setLoadingAds] = useState(true);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null); // null = create new
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [clickBehavior, setClickBehavior] = useState<"close" | "redirect">("close");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [active, setActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // The ad being edited (if any)
  const editingAd = editingId ? ads.find((a) => a.id === editingId) ?? null : null;

  // Listen to all flash ads
  useEffect(() => {
    if (!storeId) {
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
  }, [storeId, firestore]);

  function resetForm() {
    setEditingId(null);
    setImageFile(null);
    setFileInputKey((k) => k + 1);
    setClickBehavior("close");
    setRedirectUrl("");
    setActive(true);
  }

  function loadAdIntoForm(ad: FlashAdDoc) {
    setEditingId(ad.id);
    setImageFile(null);
    setFileInputKey((k) => k + 1);
    setClickBehavior(ad.clickBehavior);
    setRedirectUrl(ad.redirectUrl || "");
    setActive(ad.active);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function duplicateAd(ad: FlashAdDoc) {
    setEditingId(null); // create mode
    setImageFile(null);
    setFileInputKey((k) => k + 1);
    setClickBehavior(ad.clickBehavior);
    setRedirectUrl(ad.redirectUrl || "");
    setActive(true);
    toast({ title: "Duplicating ad", description: "Loaded settings from existing ad. Upload a new image or save to reuse the same one." });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const MAX_WIDTH = 800;
  const JPEG_QUALITY = 0.7;
  const MAX_FILE_SIZE = 500 * 1024; // 500KB

  async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width));
          width = MAX_WIDTH;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
          "image/jpeg",
          JPEG_QUALITY
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  }

  async function uploadAdImage(file: File): Promise<{ url: string; path: string }> {
    const compressed = await compressImage(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "") + ".jpg";
    const path = `flashAdImages/${storeId}/${Date.now()}-${safeName}`;
    const r = ref(storage, path);
    await uploadBytes(r, compressed, { contentType: "image/jpeg" });
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

  const activeAdsCount = ads.filter((a) => a.active).length;

  return (
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
                  key={fileInputKey}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f && f.size > 5 * 1024 * 1024) {
                      toast({ title: "File too large", description: "Max 5MB. Image will be compressed to ~150KB on upload.", variant: "destructive" });
                      return;
                    }
                    setImageFile(f);
                  }}
                />
                {imageFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7"
                    onClick={(e) => { e.preventDefault(); setImageFile(null); setFileInputKey((k) => k + 1); }}
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
  );
}
