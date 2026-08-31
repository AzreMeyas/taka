"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDomain } from "@/app/ledger/actions";
import type { Domain, EntryKind } from "@/db/schema";

const GROUPS: [EntryKind, string][] = [
  ["expense", "Expense"],
  ["income", "Income"],
  ["savings", "Savings"],
];

export function DomainManager({ domains }: { domains: Domain[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<EntryKind>("expense");
  const [error, setError] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError("");
    start(async () => {
      const res = await addDomain({ name: trimmed, kind });
      if (res.ok) {
        setName("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs text-muted">Add a domain</p>
      <div className="flex gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. Lab fees"
          className="min-w-0 flex-1 rounded border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EntryKind)}
          className="rounded border border-rule bg-paper px-2 py-2 text-sm outline-none focus:border-ink"
        >
          {GROUPS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!name.trim() || pending}
          className="rounded bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-out">{error}</p>}

      {GROUPS.map(([k, title]) => {
        const list = domains.filter((d) => d.kind === k);
        if (list.length === 0) return null;
        return (
          <div key={k} className="mt-5">
            <p className="mb-0.5 text-[12.5px] text-muted">{title}</p>
            <div className="ruled">
              {list.map((d) => (
                <div key={d.id} className="px-2 py-2.5 text-sm">
                  {d.name}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
