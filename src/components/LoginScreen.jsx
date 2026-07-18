import React, { useEffect, useRef, useState } from "react";
import { fadeInUp } from "../motion.js";
import { BRAND_NAME, BRAND_INITIALS } from "../../shared/brand.js";

export function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    fadeInUp(panelRef.current, { duration: 0.55, y: 16 });
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onLogin(password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title" ref={panelRef}>
        <div className="login-brand" aria-hidden="true">{BRAND_INITIALS}</div>
        <div className="login-product">{BRAND_NAME}</div>
        <h1 id="login-title">Sign in to your dashboard</h1>
        <p>Enter the dashboard password to access live MIS reports from your connected Google Sheet.</p>
        <form onSubmit={submit}>
          <label>
            <span>Password</span>
            <div className="password-field">
              <input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
            </div>
          </label>
          {error ? <div className="login-error" role="alert">{error}</div> : null}
          <button className="login-submit" type="submit" disabled={submitting || !password}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
