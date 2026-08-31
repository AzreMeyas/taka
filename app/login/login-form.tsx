"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Mode = "signin" | "signup";
type State = "idle" | "submitting" | "error" | "check-email";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setMessage("");

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setState("error");
        setMessage(error.message);
        return;
      }
      // Full navigation so middleware sees the fresh session cookie.
      window.location.assign("/ledger");
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }
    if (data.session) {
      window.location.assign("/ledger");
      return;
    }
    // "Confirm email" is on in Supabase — no session until they click the link.
    setState("check-email");
  }

  if (state === "check-email") {
    return (
      <div className="mt-8 border-t border-rule pt-6">
        <p className="text-sm">
          Check <strong>{email}</strong> for a confirmation link, then sign in.
        </p>
        <button
          onClick={() => {
            setMode("signin");
            setState("idle");
          }}
          className="mt-4 text-xs text-muted underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 border-t border-rule pt-6">
      <label htmlFor="email" className="block text-xs text-muted">
        Email address
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="mt-2 w-full rounded border border-rule bg-paper px-3 py-2.5 text-[15px] outline-none focus:border-ink"
      />

      <label htmlFor="password" className="mt-4 block text-xs text-muted">
        Password
      </label>
      <input
        id="password"
        type="password"
        required
        minLength={mode === "signup" ? 8 : undefined}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === "signup" ? "At least 8 characters" : ""}
        className="mt-2 w-full rounded border border-rule bg-paper px-3 py-2.5 text-[15px] outline-none focus:border-ink"
      />

      <button
        type="submit"
        disabled={state === "submitting" || !email || !password}
        className="mt-4 w-full rounded bg-ink px-4 py-3 text-sm font-semibold text-paper disabled:opacity-40"
      >
        {state === "submitting"
          ? mode === "signin"
            ? "Signing in…"
            : "Creating account…"
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </button>

      {state === "error" && <p className="mt-3 text-xs text-out">{message}</p>}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setState("idle");
          setMessage("");
        }}
        className="mt-4 text-xs text-muted underline"
      >
        {mode === "signin"
          ? "Need an account? Create one"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
