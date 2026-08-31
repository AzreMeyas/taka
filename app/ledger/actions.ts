"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { domains, entries } from "@/db/schema";
import { requireUser } from "@/lib/supabase/server";

/**
 * Server-side validation. Client validation is UX; this is security.
 *
 * A server action is a public HTTP endpoint — anyone can POST to it with any
 * payload. Everything crossing this boundary is untrusted.
 */

const kind = z.enum(["expense", "income", "savings"]);

const entryInput = z.object({
  amountMinor: z.number().int().positive().max(100_000_000_00),
  domainId: z.uuid(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  kind,
  method: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

const domainInput = z.object({
  name: z.string().trim().min(1, "Give it a name").max(40),
  kind,
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addEntry(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sign in to add entries." };

  const parsed = entryInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry." };
  }
  const input = parsed.data;

  // The domain must belong to THIS user. Without this check, a crafted
  // request could attach an entry to someone else's category.
  const [domain] = await db
    .select({ id: domains.id, kind: domains.kind })
    .from(domains)
    .where(and(eq(domains.id, input.domainId), eq(domains.userId, user.id)))
    .limit(1);

  if (!domain) return { ok: false, error: "That domain doesn't exist." };
  if (domain.kind !== input.kind) {
    return { ok: false, error: "That domain is for a different kind of entry." };
  }

  await db.insert(entries).values({
    userId: user.id,
    domainId: input.domainId,
    occurredOn: input.occurredOn,
    amountMinor: input.amountMinor,
    kind: input.kind,
    method: input.method ?? null,
    note: input.note ?? null,
  });

  revalidatePath("/ledger");
  return { ok: true };
}

export async function updateEntry(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sign in to edit entries." };

  const parsed = entryInput.extend({ id: z.uuid() }).safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry." };
  }
  const { id, ...input } = parsed.data;

  const [domain] = await db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, input.domainId), eq(domains.userId, user.id)))
    .limit(1);
  if (!domain) return { ok: false, error: "That domain doesn't exist." };

  // The userId in the WHERE clause is what makes this safe: an id belonging
  // to someone else simply matches zero rows.
  const updated = await db
    .update(entries)
    .set({
      domainId: input.domainId,
      occurredOn: input.occurredOn,
      amountMinor: input.amountMinor,
      kind: input.kind,
      method: input.method ?? null,
      note: input.note ?? null,
    })
    .where(and(eq(entries.id, id), eq(entries.userId, user.id)))
    .returning({ id: entries.id });

  if (!updated.length) return { ok: false, error: "Entry not found." };

  revalidatePath("/ledger");
  return { ok: true };
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sign in to delete entries." };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid id." };

  await db
    .delete(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, user.id)));

  revalidatePath("/ledger");
  return { ok: true };
}

export async function addDomain(
  raw: unknown,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Sign in to add domains." };

  const parsed = domainInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid domain." };
  }

  try {
    const [row] = await db
      .insert(domains)
      .values({ userId: user.id, name: parsed.data.name, kind: parsed.data.kind })
      .returning({ id: domains.id });
    revalidatePath("/ledger");
    return { ok: true, id: row.id };
  } catch (e) {
    // The unique index on (user_id, lower(name)) is the real guard here —
    // checking first would race with a double-submit.
    if (typeof e === "object" && e && "code" in e && e.code === "23505") {
      return { ok: false, error: "You already have a domain with that name." };
    }
    throw e;
  }
}

export async function signOut() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.auth.signOut();
}
