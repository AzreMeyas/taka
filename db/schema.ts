import {
  pgTable,
  pgEnum,
  uuid,
  text,
  date,
  bigint,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Three kinds of money movement.
 *
 * `savings` is deliberately NOT an expense: money set aside leaves your
 * spendable balance but has not been consumed. Folding it into `expense`
 * would make saving look identical to losing.
 */
export const entryKind = pgEnum("entry_kind", ["expense", "income", "savings"]);

/**
 * User-defined categories. The whole point is that these are added over
 * time, so nothing in the app may hard-code a category name.
 */
export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    kind: entryKind("kind").notNull(),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Case-insensitive uniqueness per user: "Transport" and "transport"
    // are the same category and must not both exist.
    uniqueIndex("domains_user_name_uniq").on(t.userId, sql`lower(${t.name})`),
    index("domains_user_idx").on(t.userId),
  ],
);

/**
 * The ledger itself.
 *
 * `amountMinor` is poisha (1/100 taka) stored as an integer. Never floats:
 * 0.1 + 0.2 !== 0.3 in IEEE 754, and a ledger that drifts is not a ledger.
 *
 * `occurredOn` (when the money moved) is separate from `createdAt` (when you
 * typed it in). Logging yesterday's lunch this morning is two different facts.
 */
export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "restrict" }),
    occurredOn: date("occurred_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    kind: entryKind("kind").notNull(),
    method: text("method"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Every read is "this user, this date range" — this index carries the app.
    index("entries_user_date_idx").on(t.userId, t.occurredOn.desc()),
    index("entries_user_domain_idx").on(t.userId, t.domainId),
    check("entries_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export type Domain = typeof domains.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type EntryKind = (typeof entryKind.enumValues)[number];
