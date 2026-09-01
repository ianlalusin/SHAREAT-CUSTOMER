export function PineSprigCorner({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 60"
      width="52"
      height="26"
      aria-hidden="true"
      className={className}
    >
      <line x1="8" y1="52" x2="100" y2="10" stroke="hsl(var(--pine))" strokeWidth="3" strokeLinecap="round" />
      <g fill="hsl(var(--pine))">
        <ellipse cx="30" cy="42" rx="10" ry="4.5" transform="rotate(-38 30 42)" />
        <ellipse cx="45" cy="34" rx="10" ry="4.5" transform="rotate(-38 45 34)" />
        <ellipse cx="60" cy="27" rx="10" ry="4.5" transform="rotate(-38 60 27)" />
        <ellipse cx="75" cy="19" rx="10" ry="4.5" transform="rotate(-38 75 19)" />
      </g>
      <g fill="hsl(var(--primary))">
        <circle cx="94" cy="12" r="5" />
        <circle cx="103" cy="16" r="4.5" />
        <circle cx="98" cy="22" r="4" />
      </g>
    </svg>
  );
}
