import { useId } from "react";

export function OrnamentDuo({ className = "" }: { className?: string }) {
  const uid = useId();
  const goldId = `ornDuoGold-${uid}`;
  const redId = `ornDuoRed-${uid}`;
  return (
    <svg viewBox="0 0 100 90" className={className} aria-hidden="true">
      <line x1="30" y1="8" x2="30" y2="18" stroke="hsl(var(--gold-deep))" strokeWidth="2" />
      <circle cx="30" cy="42" r="24" fill={`url(#${goldId})`} />
      <ellipse cx="21" cy="32" rx="6.5" ry="4" fill="#fff" opacity=".4" />

      <line x1="70" y1="30" x2="70" y2="40" stroke="hsl(var(--gold-deep))" strokeWidth="2" />
      <circle cx="70" cy="60" r="18" fill={`url(#${redId})`} />
      <ellipse cx="64" cy="53" rx="5" ry="3" fill="#fff" opacity=".4" />

      <defs>
        <radialGradient id={goldId} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="hsl(var(--gold-light))" />
          <stop offset="100%" stopColor="hsl(var(--gold-deep))" />
        </radialGradient>
        <radialGradient id={redId} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#ff8a8a" />
          <stop offset="100%" stopColor="hsl(var(--primary))" />
        </radialGradient>
      </defs>
    </svg>
  );
}
