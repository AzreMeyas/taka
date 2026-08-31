"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addEntry, updateEntry, deleteEntry, addDomain } from "@/app/ledger/actions";
import { parseTaka } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import type { Domain, EntryKind } from "@/db/schema";

const KINDS: [EntryKind, string][] = [
  ["expense", "Money out"],
  ["income", "Money in"],
  ["savings", "Set aside"],
];

const METHODS = ["Cash", "bKash", "Nagad", "Card", "Bank"];

const KIND_BG: Record<EntryKind, string> = {
  expense: "bg-out",
  income: "bg-in",
  savings: "bg-saved",
};

export type EditTarget = {
  id: string;
  amountMinor: number;
  domainId: string;
  occurredOn: string;
  kind: EntryKind;
  method: string | null;
  note: string | null;
};

export function AddEntry({
  domains,
  editing,
  onClose,
}: {
  domains: Domain[];
  editing?: EditTarget;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(!!editing);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-ink px-8 py-3.5 text-[14.5px] font-semibold text-paper shadow-lg"
      >
        Add entry
      </button>
    );
  }

  return <Sheet domains={domains} editing={editing} onClose={close} />;
}

function Sheet({
  domains,
  editing,
  onClose,
}: {
  domains: Domain[];
  editing?: EditTarget;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [kind, setKind] = useState<EntryKind>(editing?.kind ?? "expense");
  const [amount, setAmount] = useState(
    editing ? String(editing.amountMinor / 100) : "",
  );
  const [domainId, setDomainId] = useState(editing?.domainId ?? "");
  const [occurredOn, setOccurredOn] = useState(editing?.occurredOn ?? todayISO());
  const [method, setMethod] = useState(editing?.method ?? "Cash");
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [naming, setNaming] = useState(false);

  const pool = domains.filter((d) => d.kind === kind);
  const minor = parseTaka(amount);
  const valid = minor !== null && domainId !== "";

  function switchKind(k: EntryKind) {
    setKind(k);
    if (!domains.some((d) => d.id === domainId && d.kind === k)) setDomainId("");
  }

  function submit() {
    if (!valid) return;
    setError("");
    start(async () => {
      const payload = {
        amountMinor: minor,
        domainId,
        occurredOn,
        kind,
        method: method || null,
        note: note.trim() || null,
      };
      const res = editing
        ? await updateEntry({ ...payload, id: editing.id })
        : await addEntry(payload);

      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

  function createDomain() {
    const name = newName.trim();
    if (!name) return;
    start(async () => {
      const res = await addDomain({ name, kind });
      if (res.ok) {
        setDomainId(res.id);
        setNewName("");
        setNaming(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function remove() {
    if (!editing) return;
    start(async () => {
      await deleteEntry(editing.id);
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-xl border-t-[3px] border-ink bg-card px-[18px] pb-6 pt-5 sm:rounded-xl">
        <h2 className="mb-4 text-[15px] font-semibold">
          {editing ? "Edit entry" : "New entry"}
        </h2>

        <div className="flex overflow-hidden rounded border border-rule">
          {KINDS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => switchKind(k)}
              className={`flex-1 border-r border-rule py-2.5 text-[13px] last:border-r-0 ${
                kind === k ? `${KIND_BG[k]} font-semibold text-white` : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label htmlFor="amt" className="mb-1.5 mt-4 block text-xs text-muted">
          Amount in taka
        </label>
        <input
          id="amt"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="num w-full rounded border border-rule bg-paper px-3 py-2.5 text-[30px] font-medium outline-none focus:border-ink"
        />

        <p className="mb-1.5 mt-4 text-xs text-muted">Domain</p>
        <div className="flex flex-wrap gap-1.5">
          {pool.map((d) => (
            <button
              key={d.id}
              onClick={() => setDomainId(d.id)}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] ${
                domainId === d.id
                  ? "border-ink bg-ink text-paper"
                  : "border-rule text-ink"
              }`}
            >
              {d.name}
            </button>
          ))}
          {!naming && (
            <button
              onClick={() => setNaming(true)}
              className="rounded-full border border-dashed border-rule px-3 py-1.5 text-[12.5px] text-muted"
            >
              + New domain
            </button>
          )}
        </div>

        {naming && (
          <div className="mt-2 flex gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createDomain()}
              placeholder="Name it"
              className="flex-1 rounded border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <button
              onClick={createDomain}
              disabled={!newName.trim() || pending}
              className="rounded bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-40"
            >
              Create
            </button>
          </div>
        )}

        <label htmlFor="dt" className="mb-1.5 mt-4 block text-xs text-muted">
          Date
        </label>
        <input
          id="dt"
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="w-full rounded border border-rule bg-paper px-3 py-2.5 text-[15px] outline-none focus:border-ink"
        />

        <p className="mb-1.5 mt-4 text-xs text-muted">Paid with</p>
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] ${
                method === m ? "border-ink bg-ink text-paper" : "border-rule text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <label htmlFor="nt" className="mb-1.5 mt-4 block text-xs text-muted">
          Note
        </label>
        <input
          id="nt"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Optional — what was it for?"
          className="w-full rounded border border-rule bg-paper px-3 py-2.5 text-[15px] outline-none focus:border-ink"
        />

        {error && <p className="mt-3 text-xs text-out">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded border border-ink py-3 text-sm font-medium"
          >
            Cancel
          </button>
          {editing && (
            <button
              onClick={remove}
              disabled={pending}
              className="flex-1 rounded border border-ink py-3 text-sm font-medium text-out"
            >
              Delete
            </button>
          )}
          <button
            onClick={submit}
            disabled={!valid || pending}
            className="flex-1 rounded bg-ink py-3 text-sm font-semibold text-paper disabled:opacity-40"
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Add entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
