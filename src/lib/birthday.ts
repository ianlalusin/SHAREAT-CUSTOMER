/**
 * The card screen shows a birthday as "April 2" — never the year. The server
 * therefore sends only "MM-DD" (audit PRV-02: return what the screen shows).
 */

/** "1995-04-02" -> "04-02"; anything that is not a full date -> null. */
export function birthMonthDay(bday: unknown): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(bday ?? "").trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

/** "04-02" -> "April 2"; null / malformed -> "". */
export function formatBirthday(monthDay: string | null | undefined): string {
  const m = /^(\d{2})-(\d{2})$/.exec(String(monthDay ?? ""));
  if (!m) return "";
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  // Year 2000 is a leap year, so Feb 29 formats instead of rolling to Mar 1.
  return new Date(2000, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}
