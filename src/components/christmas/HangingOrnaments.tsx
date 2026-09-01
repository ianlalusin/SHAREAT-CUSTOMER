import { ParolStar } from "./ParolStar";

const ITEMS = [
  { kind: "ball", color: "gold", drop: 20 },
  { kind: "ball", color: "red", drop: 12 },
  { kind: "parol", drop: 16 },
  { kind: "ball", color: "pine", drop: 14 },
  { kind: "ball", color: "gold", drop: 24 },
] as const;

const BALL_GRADIENTS: Record<string, string> = {
  gold: "radial-gradient(circle at 35% 30%, hsl(var(--gold-light)), hsl(var(--gold-deep)))",
  red: "radial-gradient(circle at 35% 30%, #ff8a8a, hsl(var(--primary)))",
  pine: "radial-gradient(circle at 35% 30%, #5fd6a0, hsl(var(--pine)))",
};

/** A few ornaments and a parol dangling by a thread — meant to hang off the bottom edge of a header. */
export function HangingOrnaments({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex items-start justify-center gap-7 ${className}`}>
      {ITEMS.map((item, i) => (
        <div key={i} className="flex flex-col items-center">
          <span className="w-px bg-gold-deep/70" style={{ height: item.drop }} />
          {item.kind === "parol" ? (
            <ParolStar className="h-6 w-5 -mt-0.5" />
          ) : (
            <span
              className="block rounded-full"
              style={{
                width: 15,
                height: 15,
                background: BALL_GRADIENTS[item.color],
                boxShadow: "inset -2px -2px 3px rgba(0,0,0,.25), inset 1px 1px 2px rgba(255,255,255,.5)",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
