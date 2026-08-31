import Link from "next/link";
import { formatTaka, formatTakaCompact } from "@/lib/money";
import { bucketsBetween, dayLabel, monthLabel, rangeLabel } from "@/lib/dates";
import type { Grain, SeriesPoint, DomainTotal } from "@/db/queries";
import type { Domain, EntryKind } from "@/db/schema";

export type ChartType = "line" | "bar";

const KINDS: [EntryKind, string][] = [
  ["expense", "Money out"],
  ["income", "Money in"],
  ["savings", "Set aside"],
];

const GRAIN_LABEL: Record<Grain, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};

/** Cycled per domain. Eight before a colour repeats. */
const SERIES = [
  "var(--color-s1)",
  "var(--color-s2)",
  "var(--color-s3)",
  "var(--color-s4)",
  "var(--color-s5)",
  "var(--color-s6)",
  "var(--color-s7)",
  "var(--color-s8)",
];
const OTHER = "var(--color-muted)";
const TOP_N = 8;

/**
 * Round an axis maximum up to the next tidy number. The steps are fine
 * enough that the tallest bar fills most of the plot — 1/2/5 alone would
 * put an 11k peak on a 20k axis and waste half the height — while still
 * halving into a value worth printing on the axis.
 */
const NICE = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const base = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / base;
  return (NICE.find((m) => m >= n) ?? 10) * base;
}

/**
 * Catmull-Rom through the points, converted to cubic béziers. Control points
 * are clamped to the plot so a curve between two low values cannot bulge
 * below the baseline and imply money that was never spent.
 */
function smoothPath(pts: [number, number][], top: number, bottom: number): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    const [x, y] = pts[0];
    return `M ${x} ${y} L ${x} ${y}`;
  }
  const clamp = (y: number) => Math.max(top, Math.min(bottom, y));
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    d +=
      ` C ${p1[0] + (p2[0] - p0[0]) * t} ${clamp(p1[1] + (p2[1] - p0[1]) * t)},` +
      ` ${p2[0] - (p3[0] - p1[0]) * t} ${clamp(p2[1] - (p3[1] - p1[1]) * t)},` +
      ` ${p2[0]} ${p2[1]}`;
  }
  return d;
}

type EntryRow = {
  id: string;
  occurredOn: string;
  amountMinor: number;
  method: string | null;
  note: string | null;
  domainName: string;
};

export function Analysis({
  from,
  to,
  today,
  bounds,
  grain,
  grains,
  kind,
  chart,
  domainId,
  domains,
  series,
  domainTotals,
  recent,
  recentLimit,
  href,
}: {
  from: string;
  to: string;
  today: string;
  bounds: { first: string | null; last: string | null };
  grain: Grain;
  grains: Grain[];
  kind: EntryKind;
  chart: ChartType;
  domainId: string | null;
  domains: Domain[];
  series: SeriesPoint[];
  domainTotals: DomainTotal[];
  recent: EntryRow[];
  recentLimit: number;
  href: (patch: Record<string, string>) => string;
}) {
  const selected = domains.find((d) => d.id === domainId) ?? null;
  const kindLabel = KINDS.find(([k]) => k === kind)![1];

  // Ranked domains for this kind — drives colour assignment, the legend and
  // the chart, so all three agree on which colour means what.
  const ranked = domainTotals.filter((d) => d.kind === kind);
  const kindTotal = ranked.reduce((a, d) => a + d.total, 0);
  const shown = ranked.slice(0, TOP_N);
  const colourOf = new Map(shown.map((d, i) => [d.domainId, SERIES[i % SERIES.length]]));

  const buckets = bucketsBetween(from, to, grain);
  const label = (b: string) =>
    grain === "year"
      ? b.slice(0, 4)
      : grain === "month"
        ? monthLabel(b.slice(0, 7)).slice(0, 3)
        : dayLabel(b);

  // bucket -> domain -> total, with "Other" folding everything past the top N.
  const at = new Map<string, Map<string, number>>(
    buckets.map((b) => [b, new Map()]),
  );
  for (const p of series) {
    const row = at.get(p.bucket);
    if (!row) continue;
    const key = colourOf.has(p.domainId) ? p.domainId : "other";
    row.set(key, (row.get(key) ?? 0) + p.total);
  }
  const hasOther = ranked.length > TOP_N;
  const lines = [
    ...shown.map((d) => ({
      key: d.domainId,
      name: d.domainName,
      colour: colourOf.get(d.domainId)!,
    })),
    ...(hasOther
      ? [{ key: "other", name: `Other (${ranked.length - TOP_N})`, colour: OTHER }]
      : []),
  ];

  // geometry
  const H = 180;
  const PAD_L = 50;
  const PAD_B = 24;
  const TOP = 10;
  const plotW = Math.max(buckets.length * (chart === "bar" ? 34 : 26), 250);
  const stepX = buckets.length > 1 ? plotW / (buckets.length - 1) : 0;
  const barStep = plotW / Math.max(1, buckets.length);
  const barW = Math.min(20, barStep * 0.62);

  const stackTotals = buckets.map((b) =>
    lines.reduce((a, l) => a + (at.get(b)!.get(l.key) ?? 0), 0),
  );
  const peak =
    chart === "bar"
      ? Math.max(0, ...stackTotals)
      : Math.max(
          0,
          ...buckets.flatMap((b) => lines.map((l) => at.get(b)!.get(l.key) ?? 0)),
        );
  const max = niceMax(Math.max(1, peak));
  const y = (v: number) => H - (v / max) * (H - TOP);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.ceil(buckets.length / 10);
  const isEmpty = kindTotal === 0;

  const quick: [string, string, string][] = [
    ["This month", `${today.slice(0, 7)}-01`, today],
    ["This year", `${today.slice(0, 4)}-01-01`, today],
    ...(bounds.first && bounds.last
      ? ([["All time", bounds.first, bounds.last]] as [string, string, string][])
      : []),
  ];

  return (
    <div className="mt-5">
      {/* range ---------------------------------------------------------- */}
      <form method="get" action="/ledger" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="trend" />
        <input type="hidden" name="grain" value={grain} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="chart" value={chart} />
        {domainId && <input type="hidden" name="domain" value={domainId} />}
        <div className="min-w-0 flex-1">
          <label htmlFor="from" className="mb-1 block text-[11px] text-muted">
            From
          </label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={from}
            max={to}
            className="w-full rounded border border-rule bg-card px-2.5 py-2 text-[13px] outline-none focus:border-ink"
          />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="to" className="mb-1 block text-[11px] text-muted">
            To
          </label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={to}
            min={from}
            className="w-full rounded border border-rule bg-card px-2.5 py-2 text-[13px] outline-none focus:border-ink"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-ink px-4 py-2 text-[13px] font-semibold text-paper"
        >
          Apply
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-muted">
        {quick.map(([l, f, t]) => (
          <Link key={l} href={href({ from: f, to: t })} className="underline">
            {l}
          </Link>
        ))}
      </div>

      {/* what and how --------------------------------------------------- */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <div className="flex overflow-hidden rounded border border-rule">
          {KINDS.map(([k, l]) => (
            <Link
              key={k}
              href={href({ kind: k, domain: "" })}
              className={`border-r border-rule px-2.5 py-1.5 text-xs last:border-r-0 ${
                kind === k ? "bg-ink font-semibold text-paper" : "text-muted"
              }`}
            >
              {l}
            </Link>
          ))}
        </div>
        <div className="flex overflow-hidden rounded border border-rule">
          {(
            [
              ["line", "∿", "Curves"],
              ["bar", "▮", "Stacked"],
            ] as const
          ).map(([c, glyph, title]) => (
            <Link
              key={c}
              href={href({ chart: c })}
              title={title}
              aria-label={title}
              className={`border-r border-rule px-2.5 py-1.5 text-xs last:border-r-0 ${
                chart === c ? "bg-ink font-semibold text-paper" : "text-muted"
              }`}
            >
              {glyph}
            </Link>
          ))}
        </div>
        <div className="flex overflow-hidden rounded border border-rule">
          {grains.map((g) => (
            <Link
              key={g}
              href={href({ grain: g })}
              className={`border-r border-rule px-2.5 py-1.5 text-xs last:border-r-0 ${
                grain === g ? "bg-ink font-semibold text-paper" : "text-muted"
              }`}
            >
              {GRAIN_LABEL[g]}
            </Link>
          ))}
        </div>
      </div>

      {/* headline ------------------------------------------------------- */}
      <div className="mt-5 border-t border-rule pt-3">
        <p className="num text-[30px] font-medium leading-none tracking-tight">
          <span className="mr-1 text-[18px] opacity-45">৳</span>
          {formatTaka(
            selected
              ? (ranked.find((d) => d.domainId === selected.id)?.total ?? 0)
              : kindTotal,
          )}
        </p>
        <p className="mt-1.5 text-[12.5px] text-muted">
          {selected ? `${selected.name} · ` : ""}
          {kindLabel.toLowerCase()} · {rangeLabel(from, to)}
          {buckets.length > 1 && !isEmpty && (
            <>
              {" · "}
              {formatTaka(
                Math.round(
                  (selected
                    ? (ranked.find((d) => d.domainId === selected.id)?.total ?? 0)
                    : kindTotal) / buckets.length,
                ),
              )}{" "}
              per {grain}
            </>
          )}
        </p>
      </div>

      {/* chart ---------------------------------------------------------- */}
      {isEmpty ? (
        <p className="px-1.5 py-10 text-[13.5px] leading-relaxed text-muted">
          Nothing recorded as {kindLabel.toLowerCase()}
          {selected ? ` against ${selected.name}` : ""} between{" "}
          {rangeLabel(from, to)}.
        </p>
      ) : (
        <div className="-mx-[18px] mt-3 overflow-x-auto px-[18px] pb-1">
          <svg
            width={PAD_L + plotW + 10}
            height={H + PAD_B}
            role="img"
            aria-label={`${kindLabel} by ${grain}, ${rangeLabel(from, to)}`}
          >
            {ticks.map((t) => {
              const ty = y(max * t);
              // Gridlines at every quarter, but only the halves get labels:
              // a quarter of a round maximum is not itself a round number,
              // and "3.8k" next to "5k" reads as noise.
              const labelled = t === 0 || t === 0.5 || t === 1;
              return (
                <g key={t}>
                  <line
                    x1={PAD_L}
                    y1={ty}
                    x2={PAD_L + plotW}
                    y2={ty}
                    stroke={t === 0 ? "var(--color-rule)" : "var(--color-rule-soft)"}
                  />
                  {labelled && (
                    <text
                      x={PAD_L - 7}
                      y={ty + 3.5}
                      textAnchor="end"
                      fontSize="9.5"
                      fill="var(--color-muted)"
                      fontFamily="var(--font-mono)"
                    >
                      {formatTakaCompact(max * t)}
                    </text>
                  )}
                </g>
              );
            })}

            {chart === "bar"
              ? buckets.map((b, i) => {
                  const x = PAD_L + i * barStep + (barStep - barW) / 2;
                  let acc = 0;
                  return (
                    <g key={b}>
                      {lines.map((l) => {
                        const v = at.get(b)!.get(l.key) ?? 0;
                        if (v <= 0) return null;
                        const yTop = y(acc + v);
                        const h = y(acc) - yTop;
                        acc += v;
                        return (
                          <rect
                            key={l.key}
                            x={x}
                            y={yTop}
                            width={barW}
                            height={h}
                            fill={l.colour}
                          >
                            <title>{`${label(b)} · ${l.name} ৳${formatTaka(v)}`}</title>
                          </rect>
                        );
                      })}
                    </g>
                  );
                })
              : lines.map((l) => {
                  const pts = buckets.map(
                    (b, i) =>
                      [PAD_L + i * stepX, y(at.get(b)!.get(l.key) ?? 0)] as [
                        number,
                        number,
                      ],
                  );
                  return (
                    <g key={l.key}>
                      <path
                        d={smoothPath(pts, TOP, H)}
                        fill="none"
                        stroke={l.colour}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {buckets.length <= 40 &&
                        pts.map(([px, py], i) => (
                          <circle
                            key={buckets[i]}
                            cx={px}
                            cy={py}
                            r="2.5"
                            fill="var(--color-paper)"
                            stroke={l.colour}
                            strokeWidth="1.5"
                          >
                            <title>{`${label(buckets[i])} · ${l.name} ৳${formatTaka(
                              at.get(buckets[i])!.get(l.key) ?? 0,
                            )}`}</title>
                          </circle>
                        ))}
                    </g>
                  );
                })}

            {buckets.map((b, i) =>
              i % labelEvery === 0 ? (
                <text
                  key={b}
                  x={
                    chart === "bar"
                      ? PAD_L + i * barStep + barStep / 2
                      : PAD_L + i * stepX
                  }
                  y={H + 16}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--color-muted)"
                  fontFamily="var(--font-mono)"
                >
                  {label(b)}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      )}

      {/* legend, which is also the filter -------------------------------- */}
      {ranked.length > 0 && (
        <div className="mt-5">
          <div className="ruled">
            {ranked.map((r, i) => {
              const isOn = domainId === r.domainId;
              const colour =
                colourOf.get(r.domainId) ?? OTHER;
              return (
                <Link
                  key={r.domainId}
                  href={href({ domain: isOn ? "" : r.domainId })}
                  className="flex items-center gap-2.5 px-2 py-2.5"
                >
                  <i
                    className="h-2.5 w-2.5 shrink-0 rounded-[1px]"
                    style={{ background: colour }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">
                    {r.domainName}
                    {isOn && <span className="text-muted"> · only</span>}
                  </span>
                  <span className="num shrink-0 text-[11.5px] text-muted">
                    {kindTotal > 0 ? Math.round((r.total / kindTotal) * 100) : 0}%
                  </span>
                  <span className="num shrink-0 text-[14px] font-medium">
                    {formatTaka(r.total)}
                  </span>
                </Link>
              );
            })}
          </div>
          {otherNote(ranked.length)}
        </div>
      )}

      {/* the entries behind it ------------------------------------------ */}
      {recent.length > 0 && (
        <div className="mt-6">
          <p className="mb-0.5 text-[12.5px] text-muted">
            {selected ? `${selected.name} entries` : "Entries in this range"}
            {recent.length === recentLimit && ` · newest ${recentLimit}`}
          </p>
          <div className="ruled">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 px-2 py-2.5">
                <span className="num shrink-0 text-[11.5px] text-muted">
                  {dayLabel(r.occurredOn)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px]">
                  {r.note || r.domainName}
                  {r.note && (
                    <span className="text-muted"> · {r.domainName}</span>
                  )}
                </span>
                {r.method && (
                  <span className="shrink-0 text-[11px] text-muted">
                    {r.method}
                  </span>
                )}
                <span className="num shrink-0 text-[14px] font-medium">
                  {formatTaka(r.amountMinor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Note under the legend when domains were folded into "Other". */
function otherNote(count: number) {
  return count > TOP_N ? (
    <p className="mt-1.5 text-[11px] text-muted">
      Top {TOP_N} charted; the remaining {count - TOP_N} are grouped as Other.
    </p>
  ) : null;
}
