/**
 * The browser's stable device id.
 *
 * Hashed server-side into `participantId` (see `hashDeviceId` in
 * lib/server/customer-participants.ts), which is both the participant doc id
 * for a session and — for the games shelf — the identity a recipe is authored
 * under and a vote is counted against. So this value is what makes "one vote
 * per person" mean anything.
 *
 * Previously defined verbatim in both app/page.tsx and app/join/page.tsx; the
 * games hub needs it too, and three copies of an identity primitive is two too
 * many. Behaviour is unchanged — same key, same format, same private-mode
 * fallback.
 */
const DEVICE_ID_KEY = "shareat_device_id";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage blocked. A per-call id means the caller is treated
    // as a new device, which is the safe way round: it can never impersonate an
    // existing participant.
    return newId();
  }
}
