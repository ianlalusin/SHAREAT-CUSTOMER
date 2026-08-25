"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

/**
 * Who is signed in, which branches are theirs, and which one they are looking
 * at — resolved once, for both the `/admin` and `/manager` shells.
 *
 * This replaces the same twenty lines copy-pasted into three pages: sign-in
 * guard, id token, `/api/admin/my-stores`, restore-or-default the selection,
 * persist it back to localStorage. Three copies is how two of them end up
 * subtly different, which is exactly what the audit found.
 *
 * It is a CONVENIENCE, never a gate. Every route re-checks the caller and the
 * storeId it is handed, and the live Firestore rules refuse a branch a manager
 * is not assigned to. Nothing here is load-bearing for security.
 */

const STORE_KEY = "admin_selected_storeId";

export type StaffStore = { storeId: string; name: string };

export type StaffSession = {
  /** Still resolving Firebase auth or the caller context. */
  loading: boolean;
  /** Signed in AND accepted as staff by the server. */
  isStaff: boolean;
  role: string;
  isPlatformAdmin: boolean;
  stores: StaffStore[];
  /** The branch in focus. Empty until the store list arrives. */
  storeId: string;
  setStoreId: (id: string) => void;
  error: string | null;
};

function readStored(): string {
  try {
    return localStorage.getItem(STORE_KEY) || "";
  } catch {
    return "";
  }
}

function writeStored(id: string): void {
  try {
    localStorage.setItem(STORE_KEY, id);
  } catch {
    /* private mode: the picker still works, it just will not be remembered */
  }
}

export function useStaffSession(): StaffSession {
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [role, setRole] = useState("");
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [stores, setStores] = useState<StaffStore[]>([]);
  const [storeId, setStoreIdState] = useState("");
  const [error, setError] = useState<string | null>(null);

  const setStoreId = useCallback((id: string) => {
    setStoreIdState(id);
    writeStored(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    /* Wait for Firebase to restore the session before asking. Reading
       currentUser straight after mount returns null on any hard refresh, and
       the pages that did that showed "Not signed in" to someone who plainly
       was. */
    const unsub = onAuthStateChanged(getAuth(), async (user) => {
      if (cancelled) return;

      if (!user) {
        setLoading(false);
        setIsStaff(false);
        return;
      }

      try {
        const res = await fetch("/api/admin/my-stores", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        // A signed-in Firebase account is not a staff account. The server says
        // which, and it is the only opinion that counts.
        if (!res.ok || !json?.ok) {
          setIsStaff(false);
          setError(json?.error || "You do not have access to this area.");
          return;
        }

        const list: StaffStore[] = (Array.isArray(json.stores) ? json.stores : [])
          .map((s: any) => ({ storeId: String(s?.storeId || ""), name: String(s?.name || s?.storeId || "") }))
          .filter((s: StaffStore) => s.storeId);

        setIsStaff(true);
        setRole(String(json.role || ""));
        setIsPlatformAdmin(json.isPlatformAdmin === true);
        setStores(list);

        // Restore the remembered branch, but never one they no longer hold —
        // a reassigned manager must not keep pointing at their old store.
        const ids = list.map((s) => s.storeId);
        const remembered = readStored();
        const selected = remembered && ids.includes(remembered) ? remembered : ids[0] || "";
        if (selected) {
          setStoreIdState(selected);
          writeStored(selected);
        }
      } catch (e: any) {
        if (!cancelled) {
          setIsStaff(false);
          setError(e?.message || "Could not load your access.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return { loading, isStaff, role, isPlatformAdmin, stores, storeId, setStoreId, error };
}
