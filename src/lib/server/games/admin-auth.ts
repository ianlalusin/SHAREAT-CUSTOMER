import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

/**
 * Staff gate for the games admin routes.
 *
 * The same shape as app/api/admin/feedback/route.ts — bearer, verify, refuse
 * customer tokens outright, then require active staff or a platform admin.
 * Factored out because the games surface adds several routes and three copies
 * of an auth check is how one of them ends up subtly weaker than the others.
 */
export type AdminCaller = {
  uid: string;
  isPlatformAdmin: boolean;
  assignedStoreIds: string[];
};

export async function requireStaff(
  req: Request
): Promise<{ ok: true; caller: AdminCaller } | { ok: false; error: string; status: number }> {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, error: "Missing Authorization Bearer token.", status: 401 };

  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(m[1]);
  } catch {
    return { ok: false, error: "Invalid token.", status: 401 };
  }

  // A diner's session token must never reach a moderation route.
  if (decoded?.customer === true || decoded?.loyaltyCustomer === true) {
    return { ok: false, error: "Not allowed.", status: 403 };
  }

  const db = getAdminDb();
  const staffSnap = await db.doc(`staff/${decoded.uid}`).get();
  const staff = staffSnap.exists ? (staffSnap.data() as any) : null;

  const isPlatformAdmin = decoded.platformAdmin === true;
  const isActiveStaff = !!staff && staff.status === "active";
  if (!isPlatformAdmin && !isActiveStaff) return { ok: false, error: "Not allowed.", status: 403 };

  const assignedStoreIds: string[] = Array.isArray(staff?.assignedStoreIds)
    ? staff.assignedStoreIds.map((x: any) => String(x)).filter(Boolean)
    : [];

  return { ok: true, caller: { uid: decoded.uid, isPlatformAdmin, assignedStoreIds } };
}

/**
 * Whether this caller may act on a recipe authored at `storeId`.
 *
 * Matches the existing feedback route's rule: a platform admin sees everything,
 * and staff with no assignment recorded are not narrowed (that is how the rest
 * of this app already behaves — narrowing them here would lock out admins whose
 * assignment list was never populated).
 */
export function canModerateStore(caller: AdminCaller, storeId: string): boolean {
  if (caller.isPlatformAdmin) return true;
  if (caller.assignedStoreIds.length === 0) return true;
  return caller.assignedStoreIds.includes(storeId);
}
