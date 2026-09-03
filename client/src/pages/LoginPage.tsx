import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { errorMessage } from "../lib/api";
import { Button, ErrorNotice, Field, inputCls } from "../components/ui";

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/tickets";

  if (isAuthenticated) return <Navigate to="/tickets" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">
            SD
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">SupportDesk</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage and track support tickets</p>
        </div>

        <div className="card p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <ErrorNotice message={error} />
            <Field label="Email address" htmlFor="email">
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-500">
            New customer?{" "}
            <Link to="/signup" className="font-medium text-indigo-700 hover:underline">
              Create an account
            </Link>
          </p>
        </div>

        <div className="card mt-4 bg-slate-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Demo accounts (password: Password123!)
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-slate-600">
            <li>admin@supportdesk.dev — admin</li>
            <li>alice@supportdesk.dev — agent</li>
            <li>bob@supportdesk.dev — agent</li>
            <li>sam@supportdesk.dev — customer</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
