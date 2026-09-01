// Dec 25, 2026, 00:00 Asia/Manila (UTC+8, no DST) expressed as a UTC instant.
export const CHRISTMAS_TARGET_MS = Date.UTC(2026, 11, 24, 16, 0, 0);

export interface ChristmasCountdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

export function getChristmasCountdown(now: number = Date.now()): ChristmasCountdown {
  const diff = CHRISTMAS_TARGET_MS - now;
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  }
  let s = Math.floor(diff / 1000);
  const days = Math.floor(s / 86400); s -= days * 86400;
  const hours = Math.floor(s / 3600); s -= hours * 3600;
  const minutes = Math.floor(s / 60); s -= minutes * 60;
  const seconds = s;
  return { days, hours, minutes, seconds, isPast: false };
}

/** Customer-facing routes get the Christmas theme; internal staff tools do not. */
export function isCustomerFacingRoute(pathname: string): boolean {
  return !pathname.startsWith("/admin") && !pathname.startsWith("/manager");
}
