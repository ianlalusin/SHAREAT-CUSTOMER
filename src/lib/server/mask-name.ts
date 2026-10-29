/**
 * "Ana Dela Cruz" -> "Ana C.".
 *
 * Enough for a sender to recognise the friend they meant before confirming a
 * transfer, without handing anyone who types a phone number that person's full
 * name.
 */
export function maskDisplayName(fullName: string): string {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
