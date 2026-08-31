import { formatTaka } from "@/lib/money";
import type { EntryKind } from "@/db/schema";

const BAR: Record<EntryKind, string> = {
  expense: "bg-out",
  income: "bg-in",
  savings: "bg-saved",
};
const TEXT: Record<EntryKind, string> = {
  expense: "text-out",
  income: "text-in",
  savings: "text-saved",
};

export function Breakdown({
  rows,
  spendTotal,
}: {
  rows: { domainId: string; domainName: string; kind: EntryKind; total: number; count: number }[];
  spendTotal: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-1.5 py-9 text-[13.5px] leading-relaxed text-muted">
        Nothing logged for this month yet. Tap <strong>Add entry</strong> and the
        breakdown builds itself.
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => r.total));

  return (
    <div className="ruled mt-1">
      {rows.map((r) => {
        const share =
          r.kind === "expense" && spendTotal > 0
            ? Math.round((r.total / spendTotal) * 100)
            : null;
        return (
          <div key={r.domainId + r.kind} className="flex items-center gap-2.5 px-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">{r.domainName}</p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {r.count} {r.count === 1 ? "entry" : "entries"}
                {share !== null && ` · ${share}% of spending`}
              </p>
              <div className="mt-1.5 h-[5px] bg-rule-soft">
                <div
                  className={`h-[5px] ${BAR[r.kind]}`}
                  style={{ width: `${(r.total / max) * 100}%` }}
                />
              </div>
            </div>
            <span className={`num whitespace-nowrap text-[14.5px] font-medium ${TEXT[r.kind]}`}>
              {formatTaka(r.total)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
