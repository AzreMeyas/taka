/** Date helpers. All dates are plain YYYY-MM-DD strings, never Date objects
 *  crossing a timezone boundary. */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function todayISO(tz = "Asia/Dhaka"): string {
  // en-CA formats as YYYY-MM-DD, which is what we want.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function dayLabel(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** First day of the month and first day of the next month, for range queries. */
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Shift a date by whole months, clamping the day to the target month's
 * length so 31 March minus one month is 28 February, not 3 March.
 */
export function shiftDate(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0),
  ).getUTCDate();
  t.setUTCDate(Math.min(d, lastDay));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Bucket size. Structurally the same as `Grain` in db/queries — spelled out
 * here rather than imported, because queries.ts already imports this file.
 */
type Bucket = "day" | "week" | "month" | "year";

export function isISODate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function spanDays(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/**
 * Bucket sizes that stay readable over a span. The cap is roughly a hundred
 * buckets: past that the chart is a picket fence, whatever it is measuring.
 */
export function grainsForSpan(days: number): Bucket[] {
  const out: Bucket[] = [];
  if (days <= 100) out.push("day");
  if (days <= 730) out.push("week");
  if (days <= 3100) out.push("month");
  out.push("year");
  return out;
}

/** The bucket size that reads best for a span before you change it. */
export function defaultGrainForSpan(days: number): Bucket {
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  if (days <= 1400) return "month";
  return "year";
}

const isoOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/**
 * Every bucket start between two dates, including ones with no entries.
 * Without this a month you spent nothing in simply vanishes from the chart
 * instead of showing the zero, which is the interesting part.
 *
 * Week buckets start on Monday, matching Postgres `date_trunc('week', …)`.
 */
export function bucketsBetween(from: string, to: string, grain: Bucket): string[] {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const end = Date.UTC(ty, tm - 1, td);

  let cur: number;
  if (grain === "day") {
    cur = Date.UTC(fy, fm - 1, fd);
  } else if (grain === "week") {
    const start = Date.UTC(fy, fm - 1, fd);
    const monday = (new Date(start).getUTCDay() + 6) % 7;
    cur = start - monday * 86_400_000;
  } else if (grain === "month") {
    cur = Date.UTC(fy, fm - 1, 1);
  } else {
    cur = Date.UTC(fy, 0, 1);
  }

  const out: string[] = [];
  // The guard is belt and braces: grainsForSpan already caps the count.
  while (cur <= end && out.length < 2000) {
    out.push(isoOf(cur));
    const d = new Date(cur);
    if (grain === "day") cur += 86_400_000;
    else if (grain === "week") cur += 7 * 86_400_000;
    else if (grain === "month")
      cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    else cur = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  }
  return out;
}

/** "1 Mar – 31 Aug 2026", collapsing the year when both ends share it. */
export function rangeLabel(from: string, to: string): string {
  const [fy] = from.split("-");
  const [ty] = to.split("-");
  return fy === ty
    ? `${dayLabel(from)} – ${dayLabel(to)} ${ty}`
    : `${dayLabel(from)} ${fy} – ${dayLabel(to)} ${ty}`;
}
