"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Camera, Download, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type Photo = { id: string; tableDisplayName: string; layout: string; consentAtMs: number; url: string };

/**
 * Photos diners agreed SharEat may post, for one branch.
 *
 * Shared by `/admin/capture-share` and `/manager/capture-share`, like
 * FeedbackPanel: the shell resolves the branch, this only shows it.
 */
export function CaptureSharePanel({ storeId, storeName }: { storeId: string; storeName: string }) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const headers = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("Not signed in.");
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setPhotos(null);
    try {
      const res = await fetch(`/api/manager/capture-share?storeId=${encodeURIComponent(storeId)}`, { headers: await headers(), cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load photos.");
      setPhotos(json.photos);
    } catch (e) {
      setPhotos([]);
      setError((e as Error)?.message || "Could not load photos.");
    }
  }, [storeId, headers]);

  useEffect(() => {
    if (storeId) void load();
  }, [storeId, load]);

  const remove = async (id: string) => {
    setConfirmId(null);
    setBusy(id);
    try {
      const res = await fetch(`/api/manager/capture-share?storeId=${encodeURIComponent(storeId)}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: await headers(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not delete.");
      setPhotos((p) => (p || []).filter((x) => x.id !== id));
    } catch (e) {
      toast({ variant: "destructive", title: "Delete failed", description: (e as Error)?.message });
    } finally {
      setBusy(null);
    }
  };

  if (photos === null)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Guests at {storeName} ticked &ldquo;SharEat may post this photo&rdquo;. Newest first. Links work for one hour; reload for fresh ones.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {photos.length === 0 && !error ? (
        <div className="py-16 text-center text-zinc-400">
          <Camera className="mx-auto h-10 w-10" />
          <p className="mt-2 text-sm">No shared photos yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-2xl bg-white shadow">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob / signed URL, nothing for next/image to optimise */}
              <img src={p.url} alt={`Photo from ${p.tableDisplayName || "a table"}`} className="aspect-square w-full bg-zinc-100 object-contain" loading="lazy" />
              <div className="space-y-2 p-3">
                <p className="text-xs text-muted-foreground">
                  {p.tableDisplayName || "Table"} · {new Date(p.consentAtMs).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <a href={p.url}>
                      <Download className="mr-1 h-4 w-4" /> Download
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => setConfirmId(p.id)} aria-label="Delete photo">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo for good?</AlertDialogTitle>
            <AlertDialogDescription>Use this when a guest asks for it to be removed. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmId && remove(confirmId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
