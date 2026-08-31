# Requirements

Living document. Update it when reality changes, not after.

## Who and why

One user: a student on a fixed monthly allowance. The app exists to answer
"where did my money actually go?" with data rather than memory.

Not a budgeting app. It records what happened; it does not police what should.

## Must have (v1)

- [x] Log an entry: amount, category, date, payment method, note
- [x] Three kinds: money out, money in, money set aside
- [x] Categories ("domains") are user-created and unlimited
- [x] Edit and delete any entry
- [x] Month view: what came in, went out, was set aside, and what is left
- [x] Breakdown by domain with share-of-spending
- [x] Trend by day, week, month and year
- [x] Trend over any two dates, per domain, with the entries behind it
      (see [ADR 5](decisions/0005-analysis-one-kind-at-a-time.md))
- [x] Data survives across devices (account + hosted database)
- [x] Only the owner can read their data

## Should have (v2)

- [ ] Offline entry with a sync queue — logging must work on bad mobile data
- [ ] Installable PWA with a service worker
- [ ] CSV export
- [ ] Month-close screen: what changed vs last month, one reflective question
- [ ] Archive a domain without deleting its history

## Explicitly not doing

- **Streaks, badges, gamification.** They reward logging rather than good
  decisions, and they punish you on the day you overspend, which is the day
  the honest data matters most.
- **Bank or bKash integration.** Manual entry is the point: typing the amount
  is the moment you notice the amount.
- **Multi-currency.** Taka only until there is a reason.
- **Shared or family accounts.** Different product.

## Constraints

- Must run free: Vercel Hobby + Supabase free tier
- Must be usable one-handed on a phone, on slow mobile data
- Entry must take under 10 seconds from cold open

## Definition of done for v1

Used daily for one full month without falling back to notes or memory.
