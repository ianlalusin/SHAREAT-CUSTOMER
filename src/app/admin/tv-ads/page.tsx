"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ArrowLeft, Loader2, Trash2, Tv, Upload } from "lucide-react";

import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useStaffSession } from "@/components/admin/useStaffSession";
import { adType, checkAdFile, wouldExceedBranchLimit, type TvAd } from "@/lib/tv-ads";

/**
 * TV ads for the restaurant TVs (SharEat Ads app, net.shareat.tvads). Admin only:
 * the /admin layout gates the page, POS firestore/storage rules gate the writes.
 * TVs never read Firestore; they poll POS /api/external/tv-ads for their branch.
 */

/** Length of a video file in seconds, read by the browser before upload. */
function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration || 0); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    v.src = url;
  });
}

export default function AdminTvAdsPage() {
  const router = useRouter();
  const { firestore, storage } = useFirebase();
  const { toast } = useToast();
  const { loading, stores } = useStaffSession();
  const fileInput = useRef<HTMLInputElement>(null);

  const [ads, setAds] = useState<TvAd[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [allBranches, setAllBranches] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!firestore) return;
    return onSnapshot(
      query(collection(firestore, "tvAds"), orderBy("createdAt", "desc")),
      (snap) => setAds(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TvAd, "id">) }))),
      (e) => toast({ title: "Could not load TV ads", description: e.message, variant: "destructive" }),
    );
  }, [firestore, toast]);

  const storeName = (id: string) => stores.find((s) => s.storeId === id)?.name || id;

  async function upload() {
    if (!file || !firestore || !storage) return;
    const target: string[] | "all" = allBranches ? "all" : picked;
    if (target !== "all" && target.length === 0) {
      toast({ title: "Pick at least one branch", variant: "destructive" });
      return;
    }
    const contentType = file.type || "";
    const type = adType(contentType);
    const durationSec = type === "video" ? Math.round(await videoSeconds(file)) : null;
    const problem = checkAdFile(contentType, file.size, durationSec ?? undefined);
    if (problem) {
      toast({ title: "Can't upload this file", description: problem, variant: "destructive" });
      return;
    }
    const full = wouldExceedBranchLimit(ads, target, stores.map((s) => s.storeId));
    if (full) {
      toast({ title: `${storeName(full)} already has 30 ads on`, description: "Switch one off first.", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const adRef = doc(collection(firestore, "tvAds"));
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `tvAds/${adRef.id}/${Date.now()}-${safe}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file, { contentType });
      const url = await getDownloadURL(fileRef);
      await setDoc(adRef, {
        storagePath, url, type, bytes: file.size, durationSec,
        storeIds: target, active: true, createdAt: Date.now(),
        createdBy: getAuth().currentUser?.uid ?? "",
      });
      toast({ title: "Ad uploaded", description: "TVs pick it up within 10 minutes." });
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(ad: TvAd, active: boolean) {
    if (active) {
      const full = wouldExceedBranchLimit(ads.filter((a) => a.id !== ad.id), ad.storeIds, stores.map((s) => s.storeId));
      if (full) {
        toast({ title: `${storeName(full)} already has 30 ads on`, variant: "destructive" });
        return;
      }
    }
    try {
      await updateDoc(doc(firestore, "tvAds", ad.id), { active });
    } catch (e) {
      toast({ title: "Change failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  }

  async function remove(ad: TvAd) {
    if (!confirm("Delete this ad from every TV?")) return;
    try {
      // Doc first: once it is gone no TV is told about the file, so a failed file delete only leaves an orphan.
      await deleteDoc(doc(firestore, "tvAds", ad.id));
      try { await deleteObject(ref(storage, ad.storagePath)); } catch { /* orphan file, harmless */ }
      toast({ title: "Ad deleted" });
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-[800px] space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => router.push("/admin")} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Tv className="h-6 w-6" /> TV Ads
          </h1>
          <p className="text-sm font-medium text-zinc-500">Pictures, GIFs and videos for the restaurant TVs.</p>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border bg-white p-5">
        <div className="space-y-2">
          <Label htmlFor="tv-ad-file">File</Label>
          <input
            id="tv-ad-file"
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <p className="text-xs text-zinc-500">
            Pictures and GIFs up to 10 MB. Videos: MP4, 1080p, up to 60 seconds and 50 MB. The corner card shows
            pictures and GIFs only.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Branches</Label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={allBranches} onCheckedChange={(v) => setAllBranches(v === true)} /> All branches
          </label>
          {!allBranches &&
            stores.map((s) => (
              <label key={s.storeId} className="flex items-center gap-2 pl-6 text-sm">
                <Checkbox
                  checked={picked.includes(s.storeId)}
                  onCheckedChange={(v) =>
                    setPicked((p) => (v === true ? [...p, s.storeId] : p.filter((x) => x !== s.storeId)))
                  }
                />
                {s.name || s.storeId}
              </label>
            ))}
        </div>

        <Button className="h-12 w-full gap-2 rounded-2xl font-bold" disabled={!file || busy} onClick={upload}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload
        </Button>
      </section>

      <section className="space-y-3">
        {ads.length === 0 && <p className="text-sm text-zinc-400">No TV ads yet.</p>}
        {ads.map((ad) => (
          <div key={ad.id} className="flex items-center gap-4 rounded-2xl border bg-white p-3">
            {ad.type === "video" ? (
              <video src={ad.url} muted className="h-20 w-32 rounded-lg bg-black object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ad.url} alt="" className="h-20 w-32 rounded-lg bg-zinc-100 object-cover" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold capitalize">
                {ad.type}
                {ad.type === "video" && ad.durationSec ? ` · ${ad.durationSec}s` : ""}
              </p>
              <p className="truncate text-zinc-500">
                {ad.storeIds === "all" ? "All branches" : ad.storeIds.map(storeName).join(", ")}
              </p>
            </div>
            <Switch checked={ad.active} onCheckedChange={(v) => toggle(ad, v)} aria-label="Show on TVs" />
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => remove(ad)} aria-label="Delete">
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        ))}
      </section>
    </main>
  );
}
