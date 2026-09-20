"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatTaka, formatTakaCompact } from "@/lib/money";

export type ChartSeries = {
  key: string;
  name: string;
  colour: string;
  values: number[];
};

/**
 * Round an axis maximum up to the next tidy number. Fine enough that the
 * tallest mark fills most of the plot, while still halving into a value
 * worth printing on the axis.
 */
const NICE = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const base = Math.pow(10, Math.floor(Math.log10(v)));
  return (NICE.find((m) => m >= v / base) ?? 10) * base;
}

/**
 * Catmull-Rom through the points as cubic beziers. Control points are clamped
 * to the plot so a curve between two low values cannot bulge below the
 * baseline and imply money that was never spent.
 */
function smoothPath(pts: [number, number][], top: number, bottom: number): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return "M " + pts[0][0] + " " + pts[0][1];
  const clamp = (v: number) => Math.max(top, Math.min(bottom, v));
  let d = "M " + pts[0][0] + " " + pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    d +=
      " C " + (p1[0] + (p2[0] - p0[0]) * t) + " " + clamp(p1[1] + (p2[1] - p0[1]) * t) +
      ", " + (p2[0] - (p3[0] - p1[0]) * t) + " " + clamp(p2[1] - (p3[1] - p1[1]) * t) +
      ", " + p2[0] + " " + p2[1];
  }
  return d;
}

/**
 * A bar with only its top corners rounded. Rounding every segment of a stack
 * leaves light bleeding through at each join, which reads as gaps between
 * separate blocks rather than one column.
 */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return (
    "M " + x + " " + (y + h) +
    " L " + x + " " + (y + rr) +
    " Q " + x + " " + y + " " + (x + rr) + " " + y +
    " L " + (x + w - rr) + " " + y +
    " Q " + (x + w) + " " + y + " " + (x + w) + " " + (y + rr) +
    " L " + (x + w) + " " + (y + h) + " Z"
  );
}

const H = 196;
const PAD_L = 44;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 26;

export function TrendChart({
  labels,
  series,
  mode,
  emptyLabel = "Nothing in this period.",
}: {
  labels: string[];
  series: ChartSeries[];
  mode: "area" | "bar";
  emptyLabel?: string;
}) {
  const gradId = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  // Measure rather than relying on viewBox scaling, so axis text stays at its
  // real size instead of stretching with the container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const hasData = series.some((s) => s.values.some((v) => v > 0));

  const plotW = Math.max(0, w - PAD_L - PAD_R);
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const barStep = plotW / Math.max(1, n);
  const barW = Math.min(26, barStep * 0.6);

  const stacked = labels.map((_, i) =>
    series.reduce((a, s) => a + (s.values[i] ?? 0), 0),
  );
  const peak =
    mode === "bar"
      ? Math.max(0, ...stacked)
      : Math.max(0, ...series.flatMap((s) => s.values));
  const max = niceMax(Math.max(1, peak));
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T);
  const xOf = (i: number) =>
    mode === "bar" ? PAD_L + i * barStep + barStep / 2 : PAD_L + i * stepX;

  const labelEvery = Math.max(1, Math.ceil(n / (w < 420 ? 6 : 12)));

  function pick(clientX: number) {
    const el = wrapRef.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const i =
      mode === "bar"
        ? Math.floor((x - PAD_L) / barStep)
        : Math.round((x - PAD_L) / (stepX || 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  if (!hasData) {
    return (
      <div className="flex h-[180px] items-center justify-center text-small text-muted">
        {emptyLabel}
      </div>
    );
  }

  const hv = hover;
  const rows =
    hv === null
      ? []
      : series
          .map((s) => ({ name: s.name, colour: s.colour, v: s.values[hv] ?? 0 }))
          .filter((r) => r.v > 0)
          .sort((a, b) => b.v - a.v);
  const hoverTotal = rows.reduce((a, r) => a + r.v, 0);

  return (
    <div
      ref={wrapRef}
      className="relative w-full touch-pan-y select-none"
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      {w > 0 && (
        <svg
          width={w}
          height={H + PAD_B}
          role="img"
          aria-label={series.map((s) => s.name).join(", ")}
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient
                key={s.key}
                id={gradId + "-" + i}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.colour} stopOpacity="0.22" />
                <stop offset="100%" stopColor={s.colour} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* gridlines — quarters faint, halves labelled */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const ty = y(max * t);
            const labelled = t === 0 || t === 0.5 || t === 1;
            return (
              <g key={t}>
                <line
                  x1={PAD_L}
                  y1={ty}
                  x2={w - PAD_R}
                  y2={ty}
                  stroke={t === 0 ? "var(--border)" : "var(--border-soft)"}
                />
                {labelled && (
                  <text
                    x={PAD_L - 8}
                    y={ty + 3.5}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--faint)"
                    fontFamily="var(--font-mono)"
                  >
                    {formatTakaCompact(max * t)}
                  </text>
                )}
              </g>
            );
          })}

          {/* crosshair sits under the marks so it never hides a value */}
          {hv !== null && (
            <line
              x1={xOf(hv)}
              y1={PAD_T - 6}
              x2={xOf(hv)}
              y2={H}
              stroke="var(--muted)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.7"
            />
          )}

          {mode === "bar"
            ? labels.map((_, i) => {
                let acc = 0;
                return (
                  <g key={i} opacity={hv === null || hv === i ? 1 : 0.45}>
                    {series.map((s, si) => {
                      const v = s.values[i] ?? 0;
                      if (v <= 0) return null;
                      const top = y(acc + v);
                      const h = Math.max(1, y(acc) - top);
                      acc += v;
                      const isTop = !series.some(
                        (o, oi) => oi > si && (o.values[i] ?? 0) > 0,
                      );
                      return (
                        <path
                          key={s.key}
                          d={barPath(
                            PAD_L + i * barStep + (barStep - barW) / 2,
                            top,
                            barW,
                            h,
                            isTop ? Math.min(4, barW / 3) : 0,
                          )}
                          fill={s.colour}
                          shapeRendering="crispEdges"
                        />
                      );
                    })}
                  </g>
                );
              })
            : series.map((s, si) => {
                const pts = s.values.map(
                  (v, i) => [xOf(i), y(v)] as [number, number],
                );
                const line = smoothPath(pts, PAD_T, H);
                const only = series.length === 1;
                return (
                  <g key={s.key}>
                    {only && (
                      <path
                        d={line + " L " + xOf(n - 1) + " " + H + " L " + xOf(0) + " " + H + " Z"}
                        fill={"url(#" + gradId + "-" + si + ")"}
                      />
                    )}
                    <path
                      d={line}
                      fill="none"
                      stroke={s.colour}
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {hv !== null && (s.values[hv] ?? 0) > 0 && (
                      <circle
                        cx={xOf(hv)}
                        cy={y(s.values[hv])}
                        r="4"
                        fill="var(--card)"
                        stroke={s.colour}
                        strokeWidth="2.5"
                      />
                    )}
                  </g>
                );
              })}

          {labels.map((l, i) =>
            i % labelEvery === 0 ? (
              <text
                key={i}
                x={xOf(i)}
                y={H + 17}
                textAnchor="middle"
                fontSize="10"
                fill={hv === i ? "var(--text)" : "var(--faint)"}
                fontFamily="var(--font-mono)"
              >
                {l}
              </text>
            ) : null,
          )}
        </svg>
      )}

      {/* shared tooltip: every series at the hovered bucket, one read */}
      {hv !== null && rows.length > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[150px] rounded-[10px] border border-border bg-card p-2.5 shadow-[var(--shadow-pop)]"
          style={{ left: Math.max(0, Math.min(Math.max(0, w - 170), xOf(hv) - 85)) }}
        >
          <p className="mb-1.5 text-micro text-muted">{labels[hv]}</p>
          {rows.map((r) => (
            <p key={r.name} className="flex items-center gap-2 text-small">
              <i
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: r.colour }}
              />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="num shrink-0 font-medium">{formatTaka(r.v)}</span>
            </p>
          ))}
          {rows.length > 1 && (
            <p className="mt-1.5 flex justify-between border-t border-border-soft pt-1.5 text-small">
              <span className="text-muted">Total</span>
              <span className="num font-semibold">{formatTaka(hoverTotal)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
