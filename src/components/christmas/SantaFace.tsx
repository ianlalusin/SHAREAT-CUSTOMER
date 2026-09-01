export function SantaFace({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {/* face */}
      <circle cx="50" cy="56" r="26" fill="#F2B78C" />
      {/* beard */}
      <path
        d="M24 54c0 20 11.6 34 26 34s26-14 26-34c0 8-6 14-12 10-3 8-9 12-14 12s-11-4-14-12c-6 4-12-2-12-10Z"
        fill="#FFFFFF"
      />
      {/* mustache */}
      <path d="M36 52c4 5 9 6 14 6s10-1 14-6c-2 6-8 9-14 9s-12-3-14-9Z" fill="#F4F4F4" />
      {/* cheeks */}
      <circle cx="34" cy="54" r="4" fill="#F49A8A" opacity=".55" />
      <circle cx="66" cy="54" r="4" fill="#F49A8A" opacity=".55" />
      {/* eyes */}
      <circle cx="39" cy="46" r="2.4" fill="#2A2118" />
      <circle cx="61" cy="46" r="2.4" fill="#2A2118" />
      {/* hat */}
      <path d="M22 34C30 14 70 14 78 34c-9-4-17-3-28 2-11-5-19-6-28-2Z" fill="hsl(var(--primary))" />
      <rect x="21" y="30" width="58" height="10" rx="5" fill="#FFFFFF" />
      <circle cx="80" cy="18" r="7" fill="#FFFFFF" />
    </svg>
  );
}
