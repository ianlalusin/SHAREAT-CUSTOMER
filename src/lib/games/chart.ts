/**
 * Geometry for the admin games line chart. Pure, so the curve can be tested
 * without a browser.
 */

export type Point = { x: number; y: number };

/**
 * A smooth SVG path through `points` (x strictly increasing).
 *
 * Monotone cubic (Fritsch–Carlson) rather than a plain Catmull-Rom spline: a
 * counter that goes 0 -> 40 -> 0 must not dip below zero or overshoot the peak
 * between days, because the curve would then claim a day nobody played.
 */
export function smoothPath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  const f = (v: number) => Math.round(v * 100) / 100;
  if (n === 1) return `M${f(points[0].x)},${f(points[0].y)}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / (dx[i] || 1));
  }

  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }

  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = points[i].x + dx[i] / 3;
    const c1y = points[i].y + (tangent[i] * dx[i]) / 3;
    const c2x = points[i + 1].x - dx[i] / 3;
    const c2y = points[i + 1].y - (tangent[i + 1] * dx[i]) / 3;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(points[i + 1].x)},${f(points[i + 1].y)}`;
  }
  return d;
}

/** The same curve closed down to the baseline, for the shaded area under it. */
export function areaPath(points: Point[], baselineY: number): string {
  if (points.length < 2) return "";
  const last = points[points.length - 1];
  const first = points[0];
  return `${smoothPath(points)} L${last.x},${baselineY} L${first.x},${baselineY} Z`;
}

/** Evenly spread `count` values over [0,width], and map values onto [0,height] (0 at the bottom). */
export function toPoints(values: number[], width: number, height: number, max: number): Point[] {
  const top = Math.max(1, max);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: values.length > 1 ? i * step : width / 2,
    y: height - (Math.max(0, v) / top) * height,
  }));
}
