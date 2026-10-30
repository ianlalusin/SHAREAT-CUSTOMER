import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret check for requests from a scheduler (not a signed-in person).
 *
 * `CRON_SECRET` unset or blank means the scheduled endpoints are switched off:
 * "not configured" is never treated as "open".
 */
export function checkCronSecret(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return { ok: false, status: 503, error: "Scheduled jobs are not configured." };

  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  const given = Buffer.from(m?.[1] ?? "");
  const want = Buffer.from(secret);
  // timingSafeEqual needs equal lengths; a length mismatch is already a "no".
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }
  return { ok: true };
}
