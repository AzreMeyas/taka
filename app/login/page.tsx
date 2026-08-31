import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Taka</h1>
      <p className="mt-2 text-sm text-muted">
        A ledger for where your money actually goes.
      </p>
      <LoginForm />
    </main>
  );
}
