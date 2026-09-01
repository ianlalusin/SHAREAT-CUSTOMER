export function ReindeerFace({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {/* antlers */}
      <g stroke="#8B5A2B" strokeWidth="3.2" strokeLinecap="round" fill="none">
        <path d="M30 30 22 10 M22 10 14 14 M22 10 16 20" />
        <path d="M70 30 78 10 M78 10 86 14 M78 10 84 20" />
      </g>
      {/* ears */}
      <ellipse cx="24" cy="44" rx="8" ry="12" fill="#A9713F" transform="rotate(-25 24 44)" />
      <ellipse cx="76" cy="44" rx="8" ry="12" fill="#A9713F" transform="rotate(25 76 44)" />
      {/* head */}
      <ellipse cx="50" cy="56" rx="28" ry="26" fill="#B07A44" />
      {/* muzzle */}
      <ellipse cx="50" cy="72" rx="14" ry="11" fill="#E9D9C4" />
      {/* eyes */}
      <circle cx="39" cy="50" r="3" fill="#2A2118" />
      <circle cx="61" cy="50" r="3" fill="#2A2118" />
      {/* nose */}
      <circle cx="50" cy="72" r="8" fill="hsl(var(--primary))" />
      <ellipse cx="47" cy="69" rx="2.4" ry="1.6" fill="#fff" opacity=".5" />
    </svg>
  );
}
