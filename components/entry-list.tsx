"use client";

import { useState } from "react";
import { formatTaka } from "@/lib/money";
import { dayLabel } from "@/lib/dates";
import { AddEntry, type EditTarget } from "./add-entry";
import type { Domain, EntryKind } from "@/db/schema";

const TEXT: Record<EntryKind, string> = {
  expense: "text-out",
  income: "text-in",
  savings: "text-saved",
};

type Row = {
  id: string;
  occurredOn: string;
  amountMinor: number;
  kind: EntryKind;
  method: string | null;
  note: string | null;
  domainId: string;
  domainName: string;
};

export function EntryList({ rows, domains }: { rows: Row[]; domains: Domain[] }) {
  const [editing, setEditing] = useState<EditTarget | null>(null);

  if (rows.length === 0) {
    return (
      <p className="px-1.5 py-9 text-[13.5px] leading-relaxed text-muted">
        No entries this month. Everything you log appears here, newest first.
      </p>
    );
  }

  return (
    <>
      <div className="ruled mt-1">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => setEditing(r)}
            className="flex w-full items-center gap-2.5 px-2 py-3 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm leading-snug">{r.note || r.domainName}</p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {dayLabel(r.occurredOn)} · {r.domainName}
                {r.method ? ` · ${r.method}` : ""}
              </p>
            </div>
            <span className={`num whitespace-nowrap text-[14.5px] font-medium ${TEXT[r.kind]}`}>
              {r.kind === "income" ? "+" : "−"}
              {formatTaka(r.amountMinor)}
            </span>
          </button>
        ))}
      </div>

      {editing && (
        <AddEntry
          domains={domains}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
