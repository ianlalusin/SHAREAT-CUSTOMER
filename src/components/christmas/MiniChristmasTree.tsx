export function MiniChristmasTree({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect x="45" y="82" width="10" height="12" fill="#7A5230" />
      <polygon points="50,58 68,82 32,82" fill="hsl(var(--pine))" />
      <polygon points="50,38 64,62 36,62" fill="hsl(var(--pine))" />
      <polygon points="50,20 60,42 40,42" fill="hsl(var(--pine))" />
      <polygon
        points="50,6 55.88,17.9 68.83,18.6 59.5,27.6 62.4,40 50,32.8 37.6,40 40.5,27.6 31.2,18.6 44.1,17.9"
        fill="hsl(var(--gold-light))"
      />
      <circle cx="43" cy="70" r="3" fill="hsl(var(--primary))" />
      <circle cx="58" cy="72" r="3" fill="hsl(var(--gold-light))" />
      <circle cx="46" cy="50" r="2.6" fill="hsl(var(--gold-light))" />
      <circle cx="57" cy="52" r="2.6" fill="hsl(var(--primary))" />
    </svg>
  );
}
