import React, { useState } from "react";

const APPROVED_EMAIL = "testw065@gmail.com";

export function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState(APPROVED_EMAIL);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand" aria-hidden="true">DL</div>
        <div className="login-product">DATA LENSE MLH</div>
        <h1 id="login-title">Sign in to your dashboard</h1>
        <p>Use the authorized account to access live MIS reports and connected data.</p>
        <form onSubmit={submit}>
          <label>
            <span>Email address</span>
            <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <div className="password-field">
              <input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
            </div>
          </label>
          {error ? <div className="login-error" role="alert">{error}</div> : null}
          <button className="login-submit" type="submit" disabled={submitting || !email.trim() || !password}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
