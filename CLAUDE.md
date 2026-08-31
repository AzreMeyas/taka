# Taka — personal ledger

A single-user money tracker. Log every taka in or out against user-defined
categories ("domains"), then see where it went by day, week, month and year.

Read `docs/requirements.md` before proposing features, and
`docs/decisions/` before changing architecture. Those files are the contract.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Drizzle ORM ·
Postgres on Supabase · deployed on Vercel.

## Where things live

```
app/ledger/page.tsx      the whole app — one page, four tabs via ?tab=
app/ledger/actions.ts    every mutation. Server actions, Zod-validated.
app/login/               email + password sign-in
app/auth/confirm/        token landing route (password reset, email confirm)
components/analysis.tsx  the Trend tab: date range, per-domain chart, drill-down
components/add-entry.tsx the entry sheet, also used for editing
db/schema.ts             table definitions — the source of truth
db/queries.ts            every read. All aggregation in SQL.
lib/money.ts             poisha <-> taka. The only file that knows decimals.
lib/dates.ts             YYYY-MM-DD helpers, bucket axis generation
lib/supabase/            auth clients and session middleware
drizzle/                 migrations. 0000 generated, 0001 hand-written.
docs/                    requirements and architecture decisions
```

State lives in the URL, not in React. Tab, month, date range, grain, chart
type, kind and domain filter are all search params, so every view is
linkable and the page stays a Server Component. `href()` in `page.tsx`
merges a patch into the current params — use it rather than building URLs.

## Repository and deployment

GitHub `AzreMeyas/taka`, SSH remote. Vercel builds and ships `main` on every
push. The database and auth are one Supabase project.

Picking this up again from a clean machine:

```bash
git clone git@github.com:AzreMeyas/taka.git && cd taka
cp .env.example .env.local   # then fill in the three values
npm install && npm run dev
```

The three environment variables are the same names locally and in Vercel.
`.env.local` is never committed. If it is gone, the Supabase URL and anon key
come from the Supabase dashboard, and `DATABASE_URL` can be revealed in the
Vercel project's environment variables — Supabase will not show the database
password a second time.

A free Supabase project pauses after about a week of no traffic. The first
request after a pause wakes it and is slow; that is not a bug in the app.

## Auth

Email and password (`signInWithPassword` / `signUp`), not magic links — see
[ADR 4](docs/decisions/0004-password-auth-over-magic-link.md). "Confirm
email" is off in the Supabase dashboard, so signup returns a session
immediately. Signup is left open; RLS isolates any stray account.

## Commands

```bash
npm run dev          # local dev server
npm run typecheck    # tsc --noEmit — run after every change
npm run build        # production build — run before declaring done
npm run db:generate  # regenerate SQL after editing db/schema.ts
```

After any change, `npm run typecheck` must pass. Before saying a task is
finished, `npm run build` must pass. Don't claim something works without
having run one of these.

## Hard rules

These are not preferences. Breaking one is a bug even if the code compiles.

**1. Money is integer poisha.** Amounts are `bigint` holding 1/100 taka.
Never floats, never `parseFloat` outside `lib/money.ts`. Only that file
converts between poisha and taka. If you find yourself writing `/ 100`
anywhere else, stop.

**2. `user_id` comes from the session, never from the request.** Every query
filters on the id returned by `requireUser()`. A user id in a request body,
URL param or form field is untrusted input and must never reach a `WHERE`
clause. New queries in `db/queries.ts` take `userId` as their first argument.

**3. Aggregation happens in SQL.** Use `GROUP BY` and `date_trunc` in
`db/queries.ts`. Never fetch all rows and reduce in JavaScript — that works at
500 entries and dies at 50,000.

**4. Validate on the server with Zod.** Server actions are public HTTP
endpoints. Anything crossing that boundary gets parsed by a Zod schema before
use. Client-side validation is UX only.

**5. `savings` is not `expense`.** Money set aside reduces the spendable
balance but is not consumed. It is excluded from "where it went" percentages.
Do not collapse the two kinds.

## Conventions

- Server Components by default. `"use client"` only when the component needs
  state or event handlers.
- Data fetching lives in `db/queries.ts`. Mutations live in
  `app/ledger/actions.ts`. Components don't query the database directly.
- Dates are plain `YYYY-MM-DD` strings end to end. Never pass a `Date` object
  across a boundary — timezone bugs enter there. Helpers are in `lib/dates.ts`.
- Styling uses the design tokens in `app/globals.css` (`text-out`, `bg-band`,
  `border-rule`, and so on). No raw hex values in components. Figures get the
  `.num` class so they align in columns.
- Errors surface to the user as text, not as thrown exceptions. Actions return
  `{ ok: false, error: string }`.

## Charts

`--color-s1` through `--color-s8` in `globals.css` are the per-domain series
colours, cycled by rank. They are sequenced for adjacent contrast — if you
add or reorder them, check that neighbours stay distinguishable.

The analysis chart plots one `kind` at a time. This is not a simplification
to undo: an income domain and an expense domain on one axis flattens the
expenses to the baseline. [ADR 5](docs/decisions/0005-analysis-one-kind-at-a-time.md)
has the reasoning.

Bucket size is derived from the span, never taken raw from the URL —
`grainsForSpan()` caps it at roughly a hundred buckets. The bucket axis comes
from `bucketsBetween()`, which must keep matching Postgres `date_trunc`
exactly; weeks start Monday in both. A mismatch does not error, it silently
drops values into gaps, so verify against the database after touching either.

`date_trunc`'s unit is interpolated with `sql.raw` from a fixed whitelist,
never bound as a parameter. Postgres only treats a SELECT expression as
grouped when it is byte-identical to the GROUP BY expression, and `$1` is not
identical to `$3` even with the same value.

## Migrations

`drizzle/0000_init.sql` is generated from `db/schema.ts` — never hand-edit it.
`drizzle/0001_security.sql` is hand-written (RLS, triggers) — Drizzle cannot
express it, so it must be maintained manually.

When the schema changes: edit `db/schema.ts`, run `npm run db:generate`, then
tell me to run the new SQL file in the Supabase dashboard. You cannot run
migrations against the database yourself.

If you add a table, it needs RLS enabled and a policy, in a new numbered SQL
file. A table without RLS is readable by anyone holding the anon key, which is
public.

## What I do, not you

You have no access to my accounts. When a task needs one of these, stop and
tell me what to do:

- Creating Supabase or Vercel projects
- Anything involving passwords, API keys or connection strings
- Running SQL against the production database
- Setting environment variables in the Vercel dashboard

Never write real secrets into any file. `.env.local` is mine to fill in.
If you need a new environment variable, add it to `.env.example` with a
placeholder and tell me.

## Working style

- For anything beyond a small edit, plan first and let me approve before you
  write code.
- Small commits, one logical change each. Conventional commit messages.
- When you make an architectural decision, add an ADR to `docs/decisions/`
  following the existing format. When scope changes, update
  `docs/requirements.md` in the same commit.
- Tell me when you think a requirement is wrong. Don't implement something you
  believe is a mistake without saying so first.

## Next up

The v2 list in `docs/requirements.md`, roughly in this order:

1. Offline entry queue — logging must work on bad mobile data. Highest value.
2. Service worker so it installs as a PWA.
3. CSV export.
4. Month-close screen.

Also open, smaller:

- `middleware.ts` is deprecated in Next 16 in favour of `proxy.ts`. It still
  works and the build only warns. The codemod is
  `npx @next/codemod@canary middleware-to-proxy .` — this is auth-critical,
  so do it on its own and test sign-in before and after.
- A loan / borrowing kind was designed and deliberately deferred. It needs a
  fourth enum value plus a direction column, so it is a migration, not an
  edit. Do not add it as a plain domain — that inflates the spending totals.

Deliberately not doing: streaks or gamification, bank integrations,
multi-currency, shared accounts. See the requirements doc for why.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
