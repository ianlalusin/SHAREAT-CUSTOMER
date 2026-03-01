"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Save } from "lucide-react";

type Dir = Record<string, string>;

const LS_KEY = "shareat_store_directory_v1";

function loadDir(defaults: Dir): Dir {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;
    return { ...defaults, ...(parsed as Dir) };
  } catch {
    return defaults;
  }
}

function saveDir(dir: Dir) {
  localStorage.setItem(LS_KEY, JSON.stringify(dir));
}

export function StoreDirectoryModal({
  open,
  onOpenChange,
  storeIds,
  defaults,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeIds: string[];
  defaults: Dir;
  onChanged?: () => void;
}) {
  const initial = useMemo(() => {
    const unique = Array.from(new Set(storeIds.filter(Boolean)));
    return unique;
  }, [storeIds]);

  const [dir, setDir] = useState<Dir>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDir(loadDir(defaults));
    setIsLoaded(true);
  }, [open, defaults]);

  const rows = useMemo(() => {
    const ids = Array.from(new Set([...initial, ...Object.keys(dir)])).filter(Boolean);
    ids.sort((a, b) => a.localeCompare(b));
    return ids;
  }, [initial, dir]);

  if (!isLoaded) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Store Directory</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-zinc-500">
          This is <b>local-only</b> (saved in your browser). It maps storeId → store name in the admin UI.
        </div>

        <div className="mt-4 max-h-[55vh] overflow-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b">
              <tr>
                <th className="text-left px-4 py-3 font-black">Store ID</th>
                <th className="text-left px-4 py-3 font-black">Store Name</th>
                <th className="px-4 py-3 w-[80px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((id) => (
                <tr key={id}>
                  <td className="px-4 py-3 font-mono text-xs">{id}</td>
                  <td className="px-4 py-3">
                    <Input
                      value={dir[id] ?? ""}
                      onChange={(e) => setDir((d) => ({ ...d, [id]: e.target.value }))}
                      placeholder="e.g. SharEat Lipa"
                      className="h-10"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setDir((d) => {
                          const copy = { ...d };
                          delete copy[id];
                          return copy;
                        })
                      }
                      aria-label="Remove mapping"
                    >
                      <Trash2 className="h-4 w-4 text-zinc-500" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-zinc-400">
                    No storeIds detected yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            className="gap-2 font-black"
            onClick={() => {
              saveDir(dir);
              onChanged?.();
              onOpenChange(false);
            }}
          >
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
