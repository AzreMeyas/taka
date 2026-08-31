/**
 * Money is stored as an integer number of poisha (1/100 taka).
 * Parsing and formatting are the only places the decimal point exists.
 */

export function parseTaka(input: string): number | null {
  const cleaned = input.replace(/[,\s৳]/g, "").trim();
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const minor = Math.round(parseFloat(cleaned) * 100);
  return Number.isFinite(minor) && minor > 0 ? minor : null;
}

export function formatTaka(minor: number, opts: { decimals?: boolean } = {}): string {
  const major = Math.abs(minor) / 100;
  return major.toLocaleString("en-US", {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  });
}

/**
 * Short form for axis labels, where a full figure would not fit.
 * Lakh and crore rather than M and B — this is a taka ledger.
 */
export function formatTakaCompact(minor: number): string {
  const major = Math.abs(minor) / 100;
  if (major >= 10_000_000) return `${+(major / 10_000_000).toFixed(1)}cr`;
  if (major >= 100_000) return `${+(major / 100_000).toFixed(1)}L`;
  if (major >= 1_000) return `${+(major / 1_000).toFixed(major < 10_000 ? 1 : 0)}k`;
  return String(Math.round(major));
}
