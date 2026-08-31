# 4. Email and password, not magic links

Date: 2026-08-31 · Status: accepted

## Context

[0003](0003-supabase-auth-own-api.md) chose Supabase Auth but did not fix a
sign-in method. The first implementation used magic links
(`signInWithOtp`): the user types an email, Supabase sends a one-time link,
clicking it creates the session.

In practice this failed on the first run. Supabase's free tier caps auth
emails at roughly two per hour and delivers them slowly. Requesting a second
link silently invalidates the first, and email providers that pre-fetch links
consume the token before the user clicks. The result is a login that is
unreliable exactly when someone is trying to get in.

## Decision

Email and password, via `signInWithPassword` and `signUp`. With Supabase's
"Confirm email" setting off, account creation returns a session immediately
with no email round-trip. The confirmation route is kept for password
recovery and in case email confirmation is turned on later.

## Reasoning

The concern in 0003 was that hand-rolled auth gets session handling, token
expiry, email verification and password reset subtly wrong. Supabase still
owns all of that with password auth — this is the same auth service and the
same session cookies, only a different call. Nothing about the "our own API
layer" architecture changes.

Google sign-in was considered. It needs a Google Cloud project, an OAuth
consent screen, and redirect URLs registered for every deployment domain —
real setup and moving parts for a single-user app. Email and password needs
none of that.

The login never depends on email delivery, which is the failure that
prompted this.

## Consequences

There is now a password to store somewhere safe; that is the user's problem,
not the app's. Signup is left open on the public URL — row level security
isolates any stray account's data, so it is stray rows, not a breach. If that
becomes annoying, disable new signups in the Supabase dashboard.
