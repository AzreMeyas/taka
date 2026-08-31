# Taka

A personal ledger. Log every taka in or out against categories you define,
then see where it went by day, week, month and year.

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle · Postgres (Supabase)

---

## Setup

Roughly 20 minutes. Steps 1, 2 and 6 need you — I can't create accounts or
enter credentials on your behalf.

### 1. Create the Supabase project

Go to [supabase.com](https://supabase.com), sign up, create a new project.
Pick Singapore or Mumbai as the region — closest to Dhaka.

Save the database password it gives you. You cannot retrieve it later.

### 2. Create the tables

In the Supabase dashboard, open **SQL Editor** and run these two files in
order, pasting the contents of each and clicking Run:

1. `drizzle/0000_init.sql` — tables, indexes, constraints
2. `drizzle/0001_security.sql` — row level security, triggers, starter domains

Run them in that order. The second depends on the first.

### 3. Collect three secrets

| Value | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API Keys → `anon` `public` |
| `DATABASE_URL` | Project Settings → Database → Connection string → **Transaction pooler** |

The project URL is the bare origin — `https://xxxx.supabase.co`, with no
`/rest/v1/` path and no trailing slash. The client appends its own paths.

For `DATABASE_URL`: use the pooler on port **6543**, not the direct connection
on 5432. Replace `[YOUR-PASSWORD]` with the password from step 1 — brackets
and all — and append `?pgbouncer=true`. If the password contains a `%`, write
it as `%25`; a bare `%` is an escape character in a URL and the driver will
fail to parse it.

The `anon` key is public by design — it ships to the browser. That is safe
*only* because row level security is switched on, which is what step 2 did.

### 4. Run it locally

First, in Supabase → **Authentication → Providers → Email**, turn **Confirm
email** off. This makes account creation instant with no email round-trip.

```bash
cp .env.example .env.local   # then fill in the three values
npm install
npm run dev
```

Open http://localhost:3000, choose "Create one", and sign up with an email
and password. You are in immediately. Eight starter domains are created
automatically. See [ADR 0004](docs/decisions/0004-password-auth-over-magic-link.md)
for why it is password auth and not magic links.

### 5. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/taka.git
git push -u origin main
```

Check that `.env.local` is **not** in the commit. `.gitignore` covers it, but
verify with `git status` before pushing. A leaked database URL is a bad day.

### 6. Deploy to Vercel

Sign in to [vercel.com](https://vercel.com) with GitHub, import the repo, and
add the same three environment variables from step 3 — same names, same
values. Nothing else is needed.

Then in Supabase → Authentication → URL Configuration, set **Site URL** to
`https://your-app.vercel.app` and add `https://your-app.vercel.app/**` to
**Redirect URLs**. Sign-in works without this, but any future password-reset
or email-confirmation link would bounce you back to localhost.

Deploy. Every push to `main` ships automatically from then on.

Vercel Hobby and the Supabase free tier both cover this comfortably. Note
that a free Supabase project pauses after about a week with no traffic —
opening the app wakes it, but the first request after a pause is slow.

---

## Commands

```bash
npm run dev         # local dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run db:generate # regenerate SQL after editing db/schema.ts
```

## Where things live

```
app/ledger/         the app — page (server) + actions (server)
app/login/          email + password sign-in
app/auth/confirm/   token landing route (password reset, email confirm)
components/         UI — analysis.tsx is the Trend tab
db/schema.ts        table definitions — the source of truth
db/queries.ts       every read, all aggregation in SQL
lib/supabase/       auth clients and session middleware
lib/money.ts        poisha ↔ taka. The only file that knows about decimals.
lib/dates.ts        YYYY-MM-DD helpers and chart bucket axes
drizzle/            migrations. 0000 generated, 0001 hand-written.
docs/               requirements and architecture decisions
```

## The four tabs

**Where it went** — this month by domain, with share of spending.
**Trend** — pick any two dates, chart one kind (out / in / set aside) as a
curve or stacked bar per domain, tap a domain to isolate it, and read the
entries behind whatever is selected.
**Entries** — this month's entries, newest first. Tap one to edit or delete.
**Domains** — your categories.

Every view is a URL, so any question you've asked is bookmarkable.

## Two rules

**Money is integers.** Amounts are stored as poisha (1/100 taka) in a
`bigint`. `0.1 + 0.2 !== 0.3` in floating point, and a ledger that drifts is
worthless. Only `lib/money.ts` converts.

**`user_id` comes from the session, never the request.** Every query in
`db/queries.ts` and every action in `app/ledger/actions.ts` filters on the id
returned by `requireUser()`. If you add a query, it must do the same.
