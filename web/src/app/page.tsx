"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login, safeApiError } from "../lib/api";
import { clearSelectedProject, clearSession, saveLogin } from "../lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@buildingagent.local");
  const [password, setPassword] = useState("buildingagent-dev-password");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      clearSession();
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const result = await login(email, password);
      saveLogin(result.accessToken, result.user);
      clearSelectedProject();
      router.push("/projects");
    } catch (err) {
      clearSession();
      setError(safeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" className="shell">
      <section className="hero">
        <div className="panel hero-copy">
          <p className="kicker">S01 local tracer bullet</p>
          <h1>BuildingAgent</h1>
          <p className="muted">
            Sign in to the seeded local backend, select the Demo Building Project, and verify that project-scoped chat records are persisted by the API.
          </p>
        </div>
        <form className="panel card form" onSubmit={onSubmit} aria-describedby="login-help" noValidate>
          <div>
            <p className="kicker">Developer login</p>
            <h2>Enter the workspace</h2>
            <p id="login-help" className="muted">Uses the backend /api/v1/auth/login contract. Failed logins clear local session state.</p>
          </div>
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <label className="field" htmlFor="email">
            Email address
            <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field" htmlFor="password">
            Password
            <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
