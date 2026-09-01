// Capiz-star parol — 5-point star only, gold gradient, no red anywhere.
// (An earlier draft used a 🏮 lantern emoji here, which reads as a red
// Chinese/Japanese paper lantern rather than a Filipino star parol — removed.)
import { useId } from "react";

export function ParolStar({ className = "" }: { className?: string }) {
  const id = `parolStarGrad-${useId()}`;
  return (
    <svg viewBox="0 0 100 116" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#FFF6DC" />
          <stop offset="55%" stopColor="hsl(var(--gold-light))" />
          <stop offset="100%" stopColor="hsl(var(--gold-deep))" />
        </radialGradient>
      </defs>
      <polygon
        points="50,10 60,36.25 88.04,37.64 66.17,55.25 73.51,82.36 50,67 26.49,82.36 33.83,55.25 11.96,37.64 40,36.25"
        fill={`url(#${id})`}
        stroke="hsl(var(--gold-deep))"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
