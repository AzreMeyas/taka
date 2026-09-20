import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import {
  listDomains,
  listDomainsWithCounts,
  listEntriesForMonth,
  monthTotals,
  breakdownByDomain,
  trendByDomain,
  domainTotalsForRange,
  entriesInRange,
  dataBounds,
  monthsWithData,
  type Grain,
} from "@/db/queries";
import { formatTaka } from "@/lib/money";
import {
  todayISO,
  monthOf,
  monthLabel,
  shiftMonth,
  shiftDate,
  isISODate,
  spanDays,
  grainsForSpan,
  defaultGrainForSpan,
} from "@/lib/dates";
import type { EntryKind } from "@/db/schema";
import { AddEntry } from "@/components/add-entry";
import { EntryList } from "@/components/entry-list";
import { Breakdown } from "@/components/breakdown";
import { Analysis, type ChartType } from "@/components/analysis";
import { DomainManager } from "@/components/domain-manager";

const TABS = [
  ["where", "Where it went"],
  ["trend", "Trend"],
  ["entries", "Entries"],
  ["domains", "Domains"],
] as const;

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    tab?: string;
    grain?: string;
    from?: string;
    to?: string;
    kind?: string;
    chart?: string;
    split?: string;
    domain?: string;
  }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const today = todayISO();
  const thisMonth = monthOf(today);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "where";

  // Any two dates, not a fixed set of windows. Backwards ranges are swapped
  // rather than rejected — it is obvious what was meant.
  const rawFrom = isISODate(sp.from) ? sp.from : shiftDate(today, -6);
  const rawTo = isISODate(sp.to) ? sp.to : today;
  const [from, to] = rawFrom <= rawTo ? [rawFrom, rawTo] : [rawTo, rawFrom];

  const span = spanDays(from, to);
  const grains = grainsForSpan(span) as Grain[];
  // Daily buckets over three years is a thousand unreadable marks, so a grain
  // the span cannot carry falls back to the one that reads best for it.
  const grain: Grain = grains.includes(sp.grain as Grain)
    ? (sp.grain as Grain)
    : defaultGrainForSpan(span);

  const kind: EntryKind = (["expense", "income", "savings"] as const).includes(
    sp.kind as EntryKind,
  )
    ? (sp.kind as EntryKind)
    : "expense";
  const chart: ChartType = sp.chart === "bar" ? "bar" : "area";
  const split = sp.split === "1";

  const [domainList, totals, rows, months, domainRows] = await Promise.all([
    listDomains(user.id),
    monthTotals(user.id, month),
    listEntriesForMonth(user.id, month),
    monthsWithData(user.id),
    tab === "domains" ? listDomainsWithCounts(user.id) : Promise.resolve([]),
  ]);

  // A domain id from the URL is untrusted: it counts only if it is one of
  // this user's own domains.
  const domainId = domainList.find((d) => d.id === sp.domain)?.id ?? null;

  const RECENT_LIMIT = 40;
  const analysis =
    tab === "trend"
      ? await Promise.all([
          trendByDomain(user.id, { grain, from, to, kind, domainId }),
          domainTotalsForRange(user.id, from, to),
          entriesInRange(user.id, {
            from,
            to,
            kind,
            domainId,
            limit: RECENT_LIMIT,
          }),
          dataBounds(user.id),
        ])
      : null;

  const net = totals.income - totals.expense - totals.savings;
  const href = (patch: Record<string, string>) => {
    const merged: Record<string, string> = {
      month,
      tab,
      grain,
      from,
      to,
      kind,
      chart,
      ...(split ? { split: "1" } : {}),
      ...(domainId ? { domain: domainId } : {}),
      ...patch,
    };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/ledger?${q}`;
  };

  return (
    <main className="mx-auto max-w-3xl px-[18px] pb-28">
      {/* masthead ------------------------------------------------------- */}
      <header className="pt-7">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold tracking-tight">Ledger</span>
          {/* The trend tab carries its own date range and headline. Showing
              one month's totals above an analysis of six is just confusing. */}
          <div className={`items-center gap-0.5 ${tab === "trend" ? "hidden" : "flex"}`}>
            <Link
              href={href({ month: shiftMonth(month, -1) })}
              aria-label="Previous month"
              className="grid h-[26px] w-[26px] place-items-center rounded-sm border border-rule hover:bg-band"
            >
              ‹
            </Link>
            <span className="num min-w-[78px] text-center text-[13px] font-medium">
              {monthLabel(month)}
            </span>
            <Link
              href={href({ month: shiftMonth(month, 1) })}
              aria-label="Next month"
              className="grid h-[26px] w-[26px] place-items-center rounded-sm border border-rule hover:bg-band"
            >
              ›
            </Link>
          </div>
        </div>

        {tab !== "trend" && (
          <>
            <div className="mt-5">
              <p
                className={`num text-[46px] font-medium leading-none tracking-tight ${
                  net < 0 ? "text-out" : ""
                }`}
              >
                <span className="mr-1 text-[26px] opacity-45">৳</span>
                {net < 0 ? "−" : ""}
                {formatTaka(net)}
              </p>
              <p className="mt-2 text-[12.5px] text-muted">
                {rows.length === 0
                  ? "Nothing logged this month yet"
                  : net < 0
                    ? "Spent more than came in"
                    : "Left after spending and saving"}
              </p>
            </div>

            <div className="mt-5 flex border-t border-rule">
              {(
                [
                  ["Came in", totals.income, "text-in"],
                  ["Went out", totals.expense, "text-out"],
                  ["Set aside", totals.savings, "text-saved"],
                ] as const
              ).map(([label, value, colour]) => (
                <div
                  key={label}
                  className="flex-1 border-r border-rule-soft pt-3 last:border-r-0"
                >
                  <span className="block text-[11px] text-muted">{label}</span>
                  <strong className={`num text-base font-medium ${colour}`}>
                    {formatTaka(value)}
                  </strong>
                </div>
              ))}
            </div>
          </>
        )}
      </header>

      {/* tabs ----------------------------------------------------------- */}
      <nav className="mt-6 flex gap-5 border-b border-rule">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={href({ tab: key })}
            className={`-mb-px border-b-2 py-2.5 text-[13px] ${
              tab === key
                ? "border-ink font-semibold text-ink"
                : "border-transparent text-muted"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* content -------------------------------------------------------- */}
      {tab === "where" && (
        <Breakdown
          rows={await breakdownByDomain(user.id, month)}
          spendTotal={totals.expense}
        />
      )}

      {tab === "trend" && analysis && (
        <Analysis
          from={from}
          to={to}
          today={today}
          bounds={analysis[3]}
          grain={grain}
          grains={grains}
          kind={kind}
          chart={chart}
          split={split}
          previousTotal={null}
          domainId={domainId}
          domains={domainList}
          series={analysis[0]}
          domainTotals={analysis[1]}
          recent={analysis[2]}
          recentLimit={RECENT_LIMIT}
          href={href}
        />
      )}

      {tab === "entries" && <EntryList rows={rows} domains={domainList} />}

      {tab === "domains" && <DomainManager domains={domainRows} />}

      <footer className="mt-7 flex gap-4 border-t border-rule pt-3.5 text-xs text-muted">
        <Link href={href({ month: thisMonth })} className="underline">
          This month
        </Link>
        <span>
          {months.length > 0
            ? `${months.length} month${months.length === 1 ? "" : "s"} on record`
            : "No history yet"}
        </span>
      </footer>

      <AddEntry domains={domainList} />
    </main>
  );
}
