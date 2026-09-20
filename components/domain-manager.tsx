"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDomain,
  renameDomain,
  setDomainArchived,
  deleteDomain,
} from "@/app/ledger/actions";
import type { EntryKind } from "@/db/schema";

const GROUPS: [EntryKind, string][] = [
  ["expense", "Money out"],
  ["income", "Money in"],
  ["savings", "Set aside"],
];

const DOT: Record<EntryKind, string> = {
  expense: "var(--out)",
  income: "var(--in)",
  savings: "var(--saved)",
};

export type DomainRow = {
  id: string;
  name: string;
  kind: EntryKind;
  archived: boolean;
  count: number;
};

export function DomainManager({ domains }: { domains: DomainRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<EntryKind>("expense");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError("");
      const res = await fn();
      if (res.ok) {
        setEditing(null);
        setConfirming(null);
        router.refresh();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    run(async () => {
      const res = await addDomain({ name: trimmed, kind });
      if (res.ok) setName("");
      return res;
    });
  }

  const active = domains.filter((d) => !d.archived);
  const archived = domains.filter((d) => d.archived);

  return (
    <div className="mt-4 space-y-3">
      {/* add ------------------------------------------------------------- */}
      <section className="card p-3.5">
        <p className="mb-2 text-micro text-muted">New domain</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. Lab fees"
            className="col-span-2 min-w-0 rounded-control border border-border bg-card px-3 py-2 text-body outline-none focus:border-accent sm:col-span-1"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EntryKind)}
            className="rounded-control border border-border bg-card px-2 py-2 text-small outline-none focus:border-accent"
          >
            {GROUPS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <button
            onClick={create}
            disabled={!name.trim() || pending}
            className="rounded-control bg-accent px-4 py-2 text-small font-semibold text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-small text-out">{error}</p>}
      </section>

      {/* active ----------------------------------------------------------- */}
      {GROUPS.map(([k, title]) => {
        const list = active.filter((d) => d.kind === k);
        if (list.length === 0) return null;
        return (
          <section key={k} className="card overflow-hidden">
            <p className="px-3.5 pt-3.5 text-micro text-muted">{title}</p>
            <div className="rows mt-1.5">
              {list.map((d) => (
                <div key={d.id} className="px-3.5 py-2.5">
                  {editing === d.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && draft.trim())
                            run(() => renameDomain({ id: d.id, name: draft.trim() }));
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="min-w-0 flex-1 rounded-control border border-accent bg-card px-2.5 py-1.5 text-body outline-none"
                      />
                      <button
                        onClick={() =>
                          draft.trim() &&
                          run(() => renameDomain({ id: d.id, name: draft.trim() }))
                        }
                        disabled={pending || !draft.trim()}
                        className="rounded-control bg-accent px-3 py-1.5 text-micro font-semibold text-white disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded-control border border-border px-3 py-1.5 text-micro text-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : confirming === d.id ? (
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-small">
                        Delete <strong>{d.name}</strong> permanently?
                      </span>
                      <button
                        onClick={() => run(() => deleteDomain(d.id))}
                        disabled={pending}
                        className="rounded-control bg-out px-3 py-1.5 text-micro font-semibold text-white disabled:opacity-40"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="rounded-control border border-border px-3 py-1.5 text-micro text-muted"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div>
                      {/* The name gets a line of its own: sharing one row with
                          the actions truncated anything longer than a word. */}
                      <div className="flex items-center gap-2.5">
                        <i
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: DOT[d.kind] }}
                        />
                        <span className="min-w-0 flex-1 truncate text-body">
                          {d.name}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 pl-[18px]">
                        <span className="num min-w-0 flex-1 truncate text-micro text-faint">
                          {d.count === 0
                            ? "unused"
                            : d.count + (d.count === 1 ? " entry" : " entries")}
                        </span>
                        <button
                          onClick={() => {
                            setEditing(d.id);
                            setDraft(d.name);
                            setConfirming(null);
                          }}
                          className="shrink-0 rounded-control px-2 py-1 text-micro text-muted hover:bg-sunk hover:text-text"
                        >
                          Rename
                        </button>
                        {d.count === 0 ? (
                          <button
                            onClick={() => {
                              setConfirming(d.id);
                              setEditing(null);
                            }}
                            className="shrink-0 rounded-control px-2 py-1 text-micro text-muted hover:bg-sunk hover:text-out"
                          >
                            Delete
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              run(() =>
                                setDomainArchived({ id: d.id, archived: true }),
                              )
                            }
                            disabled={pending}
                            title="Hides it from new entries. Its history stays."
                            className="shrink-0 rounded-control px-2 py-1 text-micro text-muted hover:bg-sunk hover:text-text"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {/* archived --------------------------------------------------------- */}
      {archived.length > 0 && (
        <section className="card overflow-hidden">
          <p className="px-3.5 pt-3.5 text-micro text-muted">
            Archived · hidden from new entries, history kept
          </p>
          <div className="rows mt-1.5">
            {archived.map((d) => (
              <div key={d.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <i
                  className="h-2 w-2 shrink-0 rounded-full opacity-40"
                  style={{ background: DOT[d.kind] }}
                />
                <span className="min-w-0 flex-1 truncate text-body text-muted">
                  {d.name}
                </span>
                <span className="num shrink-0 text-micro text-faint">
                  {d.count === 0
                    ? "unused"
                    : d.count + (d.count === 1 ? " entry" : " entries")}
                </span>
                <button
                  onClick={() =>
                    run(() => setDomainArchived({ id: d.id, archived: false }))
                  }
                  disabled={pending}
                  className="shrink-0 rounded-control px-2 py-1 text-micro text-accent hover:bg-sunk"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {active.length === 0 && archived.length === 0 && (
        <p className="px-1 py-8 text-small text-muted">
          No domains yet. Add one above and it becomes selectable when you log
          an entry.
        </p>
      )}
    </div>
  );
}
