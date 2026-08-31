# 3. Supabase for auth and Postgres, but our own API layer

Date: 2026-08-31 · Status: accepted

## Context

Supabase can be used as a full backend-as-a-service: the browser talks to it
directly and row level security decides what is visible. Or it can be used as
just a hosted Postgres with an auth service attached.

## Decision

The second. The browser never queries Supabase for data. All reads and writes
go through Next.js server actions, which query Postgres via Drizzle.

## Reasoning

Hand-rolling authentication is where solo projects get breached — session
handling, token expiry, email verification and password reset are each easy to
get subtly wrong. Supabase Auth removes that risk.

But querying from the browser puts business logic in the client, where it can
be inspected and bypassed, and it makes the architecture specific to Supabase.
Server actions keep the logic on the server and mean the database could be
swapped for any Postgres later by changing one connection string.

Row level security stays enabled regardless. The `anon` key is public — it
ships in the JavaScript bundle — so without RLS anyone holding it could read
every row through the auto-generated REST API. RLS is not the primary defence
here; it is the second one.

## Consequences

Slightly more code than the BaaS approach. In exchange, the security model has
two independent layers and the app is not locked to one vendor.
