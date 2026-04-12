/**
 * Normalize Philippine phone numbers to +63XXXXXXXXXX format.
 * Accepts: 09XXXXXXXXX, +63XXXXXXXXXX, 63XXXXXXXXXX, 9XXXXXXXXX
 * Returns null if invalid.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("63")) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("09")) {
    return `+63${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith("9")) {
    return `+63${digits}`;
  }
  return null;
}
