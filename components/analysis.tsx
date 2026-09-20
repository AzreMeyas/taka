import Link from "next/link";
import { formatTaka } from "@/lib/money";
import { bucketsBetween, dayLabel, monthLabel, rangeLabel } from "@/lib/dates";
import { TrendChart, type ChartSeries } from "./trend-chart";
import type { Grain, SeriesPoint, DomainTotal } from "@/db/queries";
import type { Domain, EntryKind } from "@/db/schema";

export type ChartType = "area" | "bar";

const KINDS: [EntryKind, string, string][] = [
  ["expense", "Money out", "var(--out)"],
  ["income", "Money in", "var(--in)"],
  ["savings", "Set aside", "var(--saved)"],
];

const ALL_GRAINS: [Grain, string][] = [
  ["day", "Daily"],
  ["week", "Weekly"],
  ["month", "Monthly"],
  ["year", "Yearly"],
];

const SERIES_COLOURS = [
  "var(--s1)",
  "var(--s2)",
  "var(--s3)",
  "var(--s4)",
  "var(--s5)",
  "var(--s6)",
  "var(--s7)",
  "var(--s8)",
];
const OTHER = "var(--faint)";
const TOP_N = 8;

type EntryRow = {
  id: string;
  occurredOn: string;
  amountMinor: number;
  method: string | null;
  note: string | null;
  domainName: string;
};

/** Segmented control. A disabled option stays visible and says why. */
function Segment({
  options,
  current,
  hrefFor,
}: {
  options: { value: string; label: string; disabled?: boolean; why?: string }[];
  current: string;
  hrefFor: (v: string) => string;
}) {
  return (
    <div className="inline-flex rounded-control border border-border bg-sunk p-0.5">
      {options.map((o) => {
        const on = o.value === current;
        const base =
          "rounded-[7px] px-2.5 py-1.5 text-micro font-medium transition-colors";
        if (o.disabled) {
          return (
            <span
              key={o.value}
              title={o.why}
              className={base + " cursor-not-allowed text-faint/60"}
            >
              {o.label}
            </span>
          );
        }
        return (
          <Link
            key={o.value}
            href={hrefFor(o.value)}
            className={
              base +
              (on
                ? " bg-card text-text shadow-[var(--shadow-card)]"
                : " text-muted hover:text-text")
            }
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Analysis({
  from,
  to,
  today,
  bounds,
  grain,
  grains,
  kind,
  chart,
  split,
  domainId,
  domains,
  series,
  domainTotals,
  previousTotal,
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
  split: boolean;
  domainId: string | null;
  domains: Domain[];
  series: SeriesPoint[];
  domainTotals: DomainTotal[];
  previousTotal: number | null;
  recent: EntryRow[];
  recentLimit: number;
  href: (patch: Record<string, string>) => string;
}) {
  const selected = domains.find((d) => d.id === domainId) ?? null;
  const [, kindLabel, kindColour] = KINDS.find(([k]) => k === kind)!;

  const ranked = domainTotals.filter((d) => d.kind === kind);
  const kindTotal = ranked.reduce((a, d) => a + d.total, 0);
  const shown = ranked.slice(0, TOP_N);
  const colourOf = new Map(
    shown.map((d, i) => [d.domainId, SERIES_COLOURS[i % SERIES_COLOURS.length]]),
  );

  const buckets = bucketsBetween(from, to, grain);
  const index = new Map(buckets.map((b, i) => [b, i]));
  const labels = buckets.map((b) =>
    grain === "year"
      ? b.slice(0, 4)
      : grain === "month"
        ? monthLabel(b.slice(0, 7)).slice(0, 3)
        : dayLabel(b),
  );

  // Build the chart series. The default is ONE line — the total for this kind.
  // Every domain at once is opt-in, because eight overlaid curves is not a
  // reading of anything.
  const zeros = () => new Array(buckets.length).fill(0) as number[];
  let chartSeries: ChartSeries[];

  if (selected) {
    const vals = zeros();
    for (const p of series) {
      if (p.domainId !== selected.id) continue;
      const i = index.get(p.bucket);
      if (i !== undefined) vals[i] += p.total;
    }
    chartSeries = [
      {
        key: selected.id,
        name: selected.name,
        colour: colourOf.get(selected.id) ?? kindColour,
        values: vals,
      },
    ];
  } else if (split) {
    const byKey = new Map<string, number[]>();
    for (const p of series) {
      const i = index.get(p.bucket);
      if (i === undefined) continue;
      const key = colourOf.has(p.domainId) ? p.domainId : "other";
      if (!byKey.has(key)) byKey.set(key, zeros());
      byKey.get(key)![i] += p.total;
    }
    chartSeries = [
      ...shown.map((d) => ({
        key: d.domainId,
        name: d.domainName,
        colour: colourOf.get(d.domainId)!,
        values: byKey.get(d.domainId) ?? zeros(),
      })),
      ...(ranked.length > TOP_N
        ? [
            {
              key: "other",
              name: "Other (" + (ranked.length - TOP_N) + ")",
              colour: OTHER,
              values: byKey.get("other") ?? zeros(),
            },
          ]
        : []),
    ].filter((s) => s.values.some((v) => v > 0));
  } else {
    const vals = zeros();
    for (const p of series) {
      const i = index.get(p.bucket);
      if (i !== undefined) vals[i] += p.total;
    }
    chartSeries = [
      { key: "total", name: kindLabel, colour: kindColour, values: vals },
    ];
  }

  const focusTotal = selected
    ? (ranked.find((d) => d.domainId === selected.id)?.total ?? 0)
    : kindTotal;

  const delta =
    previousTotal && previousTotal > 0
      ? Math.round(((focusTotal - previousTotal) / previousTotal) * 100)
      : null;

  const quick: [string, string, string][] = [
    ["This month", today.slice(0, 7) + "-01", today],
    ["This year", today.slice(0, 4) + "-01-01", today],
    ...(bounds.first && bounds.last
      ? ([["All time", bounds.first, bounds.last]] as [string, string, string][])
      : []),
  ];

  return (
    <div className="mt-4 space-y-3">
      {/* what, and over what window ------------------------------------- */}
      <section className="card p-3.5">
        <Segment
          options={KINDS.map(([k, l]) => ({ value: k, label: l }))}
          current={kind}
          hrefFor={(k) => href({ kind: k, domain: "" })}
        />

        <form
          method="get"
          action="/ledger"
          className="mt-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <input type="hidden" name="tab" value="trend" />
          <input type="hidden" name="grain" value={grain} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="chart" value={chart} />
          {split && <input type="hidden" name="split" value="1" />}
          {domainId && <input type="hidden" name="domain" value={domainId} />}
          <div className="min-w-0">
            <label htmlFor="from" className="mb-1 block text-micro text-muted">
              From
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={from}
              max={to}
              className="w-full rounded-control border border-border bg-card px-2.5 py-2 text-small outline-none focus:border-accent"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="to" className="mb-1 block text-micro text-muted">
              To
            </label>
            <input
              id="to"
              type="date"
              name="to"
              defaultValue={to}
              min={from}
              className="w-full rounded-control border border-border bg-card px-2.5 py-2 text-small outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="col-span-2 rounded-control bg-accent px-4 py-2 text-small font-semibold text-white sm:col-span-1"
          >
            Apply
          </button>
        </form>

        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {quick.map(([l, f, t]) => (
            <Link
              key={l}
              href={href({ from: f, to: t })}
              className="text-micro text-accent hover:underline"
            >
              {l}
            </Link>
          ))}
        </div>
      </section>

      {/* the number and the shape of it ---------------------------------- */}
      <section className="card p-3.5">
        <p className="text-micro text-muted">
          {selected ? selected.name : kindLabel} · {rangeLabel(from, to)}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="num text-display font-semibold leading-none tracking-tight">
            <span className="mr-1 text-title opacity-40">৳</span>
            {formatTaka(focusTotal)}
          </p>
          {delta !== null && (
            <span
              className="num text-small font-medium"
              style={{ color: delta > 0 ? "var(--out)" : "var(--in)" }}
            >
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}%
              <span className="ml-1 text-muted">vs previous</span>
            </span>
          )}
        </div>
        {buckets.length > 1 && focusTotal > 0 && (
          <p className="mt-1 text-micro text-muted">
            {formatTaka(Math.round(focusTotal / buckets.length))} per {grain}
            {" · "}
            {buckets.length} {grain}s
          </p>
        )}

        <div className="mt-3">
          <TrendChart
            labels={labels}
            series={chartSeries}
            mode={chart}
            emptyLabel={
              "No " +
              kindLabel.toLowerCase() +
              (selected ? " against " + selected.name : "") +
              " in this period."
            }
          />
        </div>

        {/* every grain stays visible; the ones that will not fit say why */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segment
            options={ALL_GRAINS.map(([g, l]) => ({
              value: g,
              label: l,
              disabled: !grains.includes(g),
              why:
                l +
                " buckets would be too many marks for this date range — narrow the range to use it.",
            }))}
            current={grain}
            hrefFor={(g) => href({ grain: g })}
          />
          <Segment
            options={[
              { value: "area", label: "Curve" },
              { value: "bar", label: "Bars" },
            ]}
            current={chart}
            hrefFor={(c) => href({ chart: c })}
          />
          {!selected && (
            <Segment
              options={[
                { value: "", label: "Total" },
                { value: "1", label: "By domain" },
              ]}
              current={split ? "1" : ""}
              hrefFor={(s) => href({ split: s })}
            />
          )}
          {selected && (
            <Link
              href={href({ domain: "" })}
              className="rounded-control border border-border px-2.5 py-1.5 text-micro text-muted hover:text-text"
            >
              ✕ Clear {selected.name}
            </Link>
          )}
        </div>
      </section>

      {/* where it went --------------------------------------------------- */}
      {ranked.length > 0 && (
        <section className="card overflow-hidden">
          <p className="px-3.5 pt-3.5 text-micro text-muted">
            By domain · tap to focus
          </p>
          <div className="rows mt-1.5">
            {ranked.map((r) => {
              const on = domainId === r.domainId;
              const pct = kindTotal > 0 ? (r.total / kindTotal) * 100 : 0;
              return (
                <Link
                  key={r.domainId}
                  href={href({ domain: on ? "" : r.domainId })}
                  className={
                    "block px-3.5 py-2.5 transition-colors " +
                    (on ? "bg-accent-soft" : "hover:bg-sunk")
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <i
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: colourOf.get(r.domainId) ?? OTHER }}
                    />
                    <span className="min-w-0 flex-1 truncate text-body">
                      {r.domainName}
                    </span>
                    <span className="num shrink-0 text-micro text-muted">
                      {Math.round(pct)}%
                    </span>
                    <span className="num shrink-0 text-body font-medium">
                      {formatTaka(r.total)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunk">
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: pct + "%",
                        background: colourOf.get(r.domainId) ?? OTHER,
                      }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
          {ranked.length > TOP_N && (
            <p className="px-3.5 pb-3 pt-2 text-micro text-faint">
              Top {TOP_N} are charted; the rest group as Other.
            </p>
          )}
        </section>
      )}

      {/* the entries behind it ------------------------------------------- */}
      {recent.length > 0 && (
        <section className="card overflow-hidden">
          <p className="px-3.5 pt-3.5 text-micro text-muted">
            {selected ? selected.name + " entries" : "Entries in this range"}
            {recent.length === recentLimit && " · newest " + recentLimit}
          </p>
          <div className="rows mt-1.5">
            {recent.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2.5 px-3.5 py-2.5"
              >
                <span className="num w-14 shrink-0 text-micro text-faint">
                  {dayLabel(r.occurredOn)}
                </span>
                <span className="min-w-0 flex-1 truncate text-body">
                  {r.note || r.domainName}
                  {r.note && (
                    <span className="text-muted"> · {r.domainName}</span>
                  )}
                </span>
                {r.method && (
                  <span className="shrink-0 rounded-full bg-sunk px-2 py-0.5 text-micro text-muted">
                    {r.method}
                  </span>
                )}
                <span className="num shrink-0 text-body font-medium">
                  {formatTaka(r.amountMinor)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
