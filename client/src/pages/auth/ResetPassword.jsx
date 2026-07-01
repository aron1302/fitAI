import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../../lib/api.js";

// Public page reached from the reset email link (/reset-password?token=…).
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const Brand = (
    <div className="brand auth-brand">
      <div className="logo">F</div>
      <div className="brand-text">
        <b>
          Fit<span>AI</span>
        </b>
        <small>Reset</small>
      </div>
    </div>
  );

  if (!token) {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ textAlign: "center" }}>
          {Brand}
          <h1 className="auth-title">Invalid reset link</h1>
          <p className="auth-sub">This link is missing its token. Request a new one from the login screen.</p>
          <Link className="btn" to="/" style={{ marginTop: 14 }}>
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        {Brand}
        {done ? (
          <div style={{ textAlign: "center" }}>
            <h1 className="auth-title">Password updated ✓</h1>
            <p className="auth-sub">
              Your password has been changed and other sessions were signed out. Log in with your new
              password.
            </p>
            <Link className="btn" to="/" style={{ marginTop: 14 }}>
              Go to login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="auth-title">Choose a new password</h1>
            <p className="auth-sub">At least 8 characters, mixing cases, numbers, or symbols.</p>
            <label className="auth-label">
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <label className="auth-label">
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Reset password"}
            </button>
            <div className="auth-footer-links">
              <Link to="/">Back to login</Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
