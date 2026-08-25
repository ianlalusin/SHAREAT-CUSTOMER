import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

import {
  judgeCaller, hasStoreAccess, roleAllowed,
  type AccessResult, type StaffRole,
} from "./access-rules";

/**
 * The ONE staff gate for every `/api/admin/*` and `/api/manager/*` route.
 *
 * Deliberately thin: it verifies a token, reads `staff/{uid}`, and hands both to
 * `access-rules.ts`, which owns every decision and is unit-tested without a
 * database. Nothing here decides anything.
 */

export * from "./access-rules";

function bearer(req: Request): string | null {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/** Who is asking. One token verification, one `staff/{uid}` read. */
export async function resolveStaff(req: Request): Promise<AccessResult> {
  const token = bearer(req);
  if (!token) return { ok: false, error: "Missing Authorization Bearer token.", status: 401 };

  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch {
    return { ok: false, error: "Invalid token.", status: 401 };
  }

  const snap = await getAdminDb().doc(`staff/${decoded.uid}`).get();
  return judgeCaller(decoded, snap.exists ? (snap.data() as any) : null);
}

/** Staff, and one of `roles`. A platform admin always passes. */
export async function requireRole(req: Request, roles: StaffRole[]): Promise<AccessResult> {
  const gate = await resolveStaff(req);
  if (!gate.ok) return gate;

  if (!roleAllowed(gate.caller, roles)) {
    return { ok: false, error: "You are not allowed to use this.", status: 403 };
  }
  return gate;
}

/** The role check, plus membership of the store being acted on. */
export async function requireStoreAccess(
  req: Request,
  roles: StaffRole[],
  storeId: string
): Promise<AccessResult> {
  if (!storeId) return { ok: false, error: "Missing storeId.", status: 400 };

  const gate = await requireRole(req, roles);
  if (!gate.ok) return gate;

  if (!hasStoreAccess(gate.caller, storeId)) {
    return { ok: false, error: "No access to this store.", status: 403 };
  }
  return gate;
}

/** Admin-only, for the chain-wide levers no single branch should pull. */
export async function requireAdmin(req: Request): Promise<AccessResult> {
  const gate = await resolveStaff(req);
  if (!gate.ok) return gate;

  if (!gate.caller.isPlatformAdmin) {
    return { ok: false, error: "This is for platform admins only.", status: 403 };
  }
  return gate;
}
