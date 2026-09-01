const GARLAND_COLORS = ["hsl(var(--accent))", "hsl(var(--primary))", "hsl(var(--pine))", "hsl(var(--gold-light))"];

function GarlandBulb({ index }: { index: number }) {
  return (
    <span
      className="christmas-twinkle inline-block h-[7px] w-[7px] rounded-full"
      style={{
        background: GARLAND_COLORS[index % GARLAND_COLORS.length],
        animation: "christmas-twinkle 2.2s ease-in-out infinite",
        animationDelay: `${index * 0.22}s`,
        boxShadow: `0 0 4px ${GARLAND_COLORS[index % GARLAND_COLORS.length]}`,
      }}
    />
  );
}

/** A row of twinkling garland bulbs. Reused on page headers and dialog chrome. */
export function GarlandStrip({ count = 9, className = "" }: { count?: number; className?: string }) {
  const bulbs = Array.from({ length: count }, (_, i) => i);
  return (
    <div aria-hidden="true" className={`flex items-center justify-center gap-3 ${className}`}>
      {bulbs.map((i) => (
        <GarlandBulb key={i} index={i} />
      ))}
    </div>
  );
}
