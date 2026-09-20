import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "./index";
import { domains, entries, type EntryKind } from "./schema";
import { monthBounds } from "@/lib/dates";

/**
 * Every function here takes userId as its first argument and filters on it.
 * There is no query in this file that can return another user's rows.
 *
 * Aggregation happens in Postgres, not in JavaScript. Pulling every row into
 * the app and reducing works at 500 entries and dies at 50,000.
 */

export async function listDomains(userId: string) {
  return db
    .select()
    .from(domains)
    .where(and(eq(domains.userId, userId), eq(domains.archived, false)))
    .orderBy(domains.kind, domains.name);
}

/**
 * Every domain including archived ones, with how many entries each carries.
 * The count decides whether a domain can be deleted or only archived, and the
 * join is scoped to this user on both sides.
 */
export async function listDomainsWithCounts(userId: string) {
  const rows = await db
    .select({
      id: domains.id,
      name: domains.name,
      kind: domains.kind,
      archived: domains.archived,
      count: sql<string>`count(${entries.id})`,
    })
    .from(domains)
    .leftJoin(
      entries,
      and(eq(entries.domainId, domains.id), eq(entries.userId, userId)),
    )
    .where(eq(domains.userId, userId))
    .groupBy(domains.id, domains.name, domains.kind, domains.archived)
    .orderBy(domains.kind, domains.name);

  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

export async function listEntriesForMonth(userId: string, month: string) {
  const { from, to } = monthBounds(month);
  return db
    .select({
      id: entries.id,
      occurredOn: entries.occurredOn,
      amountMinor: entries.amountMinor,
      kind: entries.kind,
      method: entries.method,
      note: entries.note,
      domainId: entries.domainId,
      domainName: domains.name,
    })
    .from(entries)
    .innerJoin(domains, eq(entries.domainId, domains.id))
    .where(
      and(
        eq(entries.userId, userId),
        gte(entries.occurredOn, from),
        lt(entries.occurredOn, to),
      ),
    )
    .orderBy(desc(entries.occurredOn), desc(entries.createdAt));
}

export type MonthTotals = Record<EntryKind, number>;

export async function monthTotals(
  userId: string,
  month: string,
): Promise<MonthTotals> {
  const { from, to } = monthBounds(month);
  const rows = await db
    .select({
      kind: entries.kind,
      total: sql<string>`sum(${entries.amountMinor})`,
    })
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        gte(entries.occurredOn, from),
        lt(entries.occurredOn, to),
      ),
    )
    .groupBy(entries.kind);

  const out: MonthTotals = { expense: 0, income: 0, savings: 0 };
  for (const r of rows) out[r.kind] = Number(r.total);
  return out;
}

export async function breakdownByDomain(userId: string, month: string) {
  const { from, to } = monthBounds(month);
  const rows = await db
    .select({
      domainId: entries.domainId,
      domainName: domains.name,
      kind: entries.kind,
      total: sql<string>`sum(${entries.amountMinor})`,
      count: sql<string>`count(*)`,
    })
    .from(entries)
    .innerJoin(domains, eq(entries.domainId, domains.id))
    .where(
      and(
        eq(entries.userId, userId),
        gte(entries.occurredOn, from),
        lt(entries.occurredOn, to),
      ),
    )
    .groupBy(entries.domainId, domains.name, entries.kind)
    .orderBy(sql`sum(${entries.amountMinor}) desc`);

  return rows.map((r) => ({
    domainId: r.domainId,
    domainName: r.domainName,
    kind: r.kind,
    total: Number(r.total),
    count: Number(r.count),
  }));
}

export type Grain = "day" | "week" | "month" | "year";

export type SeriesPoint = { bucket: string; domainId: string; total: number };

/**
 * One total per domain per time bucket — the shape a multi-line chart needs.
 *
 * Filtered to a single `kind` because mixing them is meaningless on one axis:
 * a ৳15,000 allowance flattens every expense line into the baseline.
 *
 * `grain` is validated against a fixed set before it reaches here. The unit
 * must be inlined as a SQL literal, not a bound parameter: Postgres only
 * treats the SELECT bucket as "grouped" if it is byte-identical to the
 * GROUP BY expression, and two different `$n` placeholders are not identical
 * even when they carry the same value. Never pass user input to this directly.
 */
export async function trendByDomain(
  userId: string,
  opts: {
    grain: Grain;
    from: string;
    to: string;
    kind: EntryKind;
    domainId?: string | null;
  },
): Promise<SeriesPoint[]> {
  const allowed: Record<Grain, string> = {
    day: "day",
    week: "week",
    month: "month",
    year: "year",
  };
  const unit = allowed[opts.grain];
  if (!unit) throw new Error(`Unsupported grain: ${opts.grain}`);

  // unit is one of the four literals above — safe to inline via sql.raw.
  const bucket = sql`date_trunc('${sql.raw(unit)}', ${entries.occurredOn})`;

  const rows = await db
    .select({
      bucket: sql<string>`to_char(${bucket}, 'YYYY-MM-DD')`,
      domainId: entries.domainId,
      total: sql<string>`sum(${entries.amountMinor})`,
    })
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        eq(entries.kind, opts.kind),
        gte(entries.occurredOn, opts.from),
        lte(entries.occurredOn, opts.to),
        opts.domainId ? eq(entries.domainId, opts.domainId) : undefined,
      ),
    )
    .groupBy(bucket, entries.domainId)
    .orderBy(sql`${bucket}`)
    // A safety net, not the window: the date range above is what bounds this.
    .limit(5000);

  return rows.map((r) => ({
    bucket: r.bucket,
    domainId: r.domainId,
    total: Number(r.total),
  }));
}

/** The individual entries behind whatever the chart is currently showing. */
export async function entriesInRange(
  userId: string,
  opts: {
    from: string;
    to: string;
    kind: EntryKind;
    domainId?: string | null;
    limit: number;
  },
) {
  return db
    .select({
      id: entries.id,
      occurredOn: entries.occurredOn,
      amountMinor: entries.amountMinor,
      kind: entries.kind,
      method: entries.method,
      note: entries.note,
      domainId: entries.domainId,
      domainName: domains.name,
    })
    .from(entries)
    .innerJoin(domains, eq(entries.domainId, domains.id))
    .where(
      and(
        eq(entries.userId, userId),
        eq(entries.kind, opts.kind),
        gte(entries.occurredOn, opts.from),
        lte(entries.occurredOn, opts.to),
        opts.domainId ? eq(entries.domainId, opts.domainId) : undefined,
      ),
    )
    .orderBy(desc(entries.occurredOn), desc(entries.createdAt))
    .limit(opts.limit);
}

/** Oldest and newest entry dates, for the "all time" range. */
export async function dataBounds(
  userId: string,
): Promise<{ first: string | null; last: string | null }> {
  const [row] = await db
    .select({
      first: sql<string | null>`min(${entries.occurredOn})`,
      last: sql<string | null>`max(${entries.occurredOn})`,
    })
    .from(entries)
    .where(eq(entries.userId, userId));
  return { first: row?.first ?? null, last: row?.last ?? null };
}

export type DomainTotal = {
  domainId: string;
  domainName: string;
  kind: EntryKind;
  total: number;
  count: number;
};

/**
 * Totals per domain across an arbitrary range, so domains can be compared
 * over six months or three years rather than only within one month.
 */
export async function domainTotalsForRange(
  userId: string,
  from: string,
  to: string,
): Promise<DomainTotal[]> {
  const rows = await db
    .select({
      domainId: entries.domainId,
      domainName: domains.name,
      kind: entries.kind,
      total: sql<string>`sum(${entries.amountMinor})`,
      count: sql<string>`count(*)`,
    })
    .from(entries)
    .innerJoin(domains, eq(entries.domainId, domains.id))
    .where(
      and(
        eq(entries.userId, userId),
        gte(entries.occurredOn, from),
        lte(entries.occurredOn, to),
      ),
    )
    .groupBy(entries.domainId, domains.name, entries.kind)
    .orderBy(sql`sum(${entries.amountMinor}) desc`);

  return rows.map((r) => ({
    domainId: r.domainId,
    domainName: r.domainName,
    kind: r.kind,
    total: Number(r.total),
    count: Number(r.count),
  }));
}

/** Months that actually contain data, for the month switcher. */
export async function monthsWithData(userId: string): Promise<string[]> {
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${entries.occurredOn}), 'YYYY-MM')`,
    })
    .from(entries)
    .where(eq(entries.userId, userId))
    .groupBy(sql`date_trunc('month', ${entries.occurredOn})`)
    .orderBy(sql`date_trunc('month', ${entries.occurredOn})`);
  return rows.map((r) => r.month);
}
