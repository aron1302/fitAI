import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { requestPasswordReset, friendlyError } from "../lib/api.js";

// Combined login / signup / forgot-password / 2FA screen shown when there's no
// active session.
export default function Auth() {
  const { login, completeTwoFactor, signup } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState(null); // info message (e.g. signup "check your email")
  const [twoFA, setTwoFA] = useState(null); // challenge token while awaiting 2FA
  const [code, setCode] = useState("");

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  // Free-tier hosting sleeps when idle and takes ~30s to wake. Probe the server
  // on mount; if it doesn't answer promptly, tell the user what's happening
  // instead of letting their first login attempt die with "Failed to fetch".
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const slowTimer = setTimeout(() => {
      if (!cancelled) setWaking(true);
    }, 2500);
    (async () => {
      for (let i = 0; i < 20 && !cancelled; i++) {
        try {
          const r = await fetch("/healthz", { cache: "no-store" });
          if (r.ok) break;
        } catch {
          // still waking — try again shortly
        }
        await new Promise((res) => setTimeout(res, 3000));
      }
      clearTimeout(slowTimer);
      if (!cancelled) setWaking(false);
    })();
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, []);

  const goMode = (m) => {
    setMode(m);
    setError(null);
    setSent(false);
    setNotice(null);
    setPassword("");
  };
  const cancelTwoFA = () => {
    setTwoFA(null);
    setCode("");
    setError(null);
  };

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (twoFA) {
        await completeTwoFactor(twoFA, code.trim());
      } else if (isForgot) {
        await requestPasswordReset(email.trim());
        setSent(true);
      } else if (isSignup) {
        const data = await signup(email.trim(), password);
        if (!data?.user) setNotice(data?.message || "Check your email to continue.");
      } else {
        const data = await login(email.trim(), password);
        if (data?.twoFactorRequired) setTwoFA(data.challenge);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const title = twoFA
    ? "Two-factor authentication"
    : isForgot
      ? "Reset your password"
      : isSignup
        ? "Create your account"
        : "Welcome back";
  const sub = twoFA
    ? "Enter the 6-digit code from your authenticator app."
    : isForgot
      ? "Enter your email and we'll send a reset link."
      : isSignup
        ? "Sign up to save your plans across devices."
        : "Log in to access your plans.";

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand auth-brand">
          <div className="logo">F</div>
          <div className="brand-text">
            <b>
              Fit<span>AI</span>
            </b>
            <small>Train smarter</small>
          </div>
        </div>
        <h1 className="auth-title">{title}</h1>
        <p className="auth-sub">{sub}</p>

        {waking && (
          <p className="auth-sub" style={{ color: "var(--warn)", marginTop: 0 }}>
            ⏳ Waking up the server — this can take up to 30 seconds on the free preview
            hosting. Hang tight…
          </p>
        )}

        {twoFA ? (
          <>
            <label className="auth-label">
              Authentication code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456 or a recovery code"
                autoFocus
                required
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Verifying…" : "Verify"}
            </button>
            <div className="auth-switch">
              <button type="button" className="auth-link" onClick={cancelTwoFA}>
                ← Back to login
              </button>
            </div>
            <p className="auth-legal">Lost your device? Enter one of your recovery codes instead.</p>
          </>
        ) : notice ? (
          <div style={{ textAlign: "center" }}>
            <p className="auth-sub">{notice}</p>
            <button type="button" className="auth-link" onClick={() => goMode("login")}>
              Back to login
            </button>
          </div>
        ) : isForgot && sent ? (
          <div style={{ textAlign: "center" }}>
            <p className="auth-sub">
              If an account exists for <b>{email}</b>, a password-reset link is on its way. Check
              your inbox (and spam).
            </p>
            <button type="button" className="auth-link" onClick={() => goMode("login")}>
              Back to login
            </button>
          </div>
        ) : (
          <>
            <label className="auth-label">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            {!isForgot && (
              <label className="auth-label">
                Password
                <input
                  type="password"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignup ? "At least 8 characters" : ""}
                  required
                />
              </label>
            )}

            {!isSignup && !isForgot && (
              <button
                type="button"
                className="auth-link"
                style={{ alignSelf: "flex-end", fontSize: 12.5 }}
                onClick={() => goMode("forgot")}
              >
                Forgot password?
              </button>
            )}

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Please wait…" : isForgot ? "Send reset link" : isSignup ? "Sign up" : "Log in"}
            </button>

            <div className="auth-switch">
              {isForgot ? (
                <>
                  Remembered it?{" "}
                  <button type="button" className="auth-link" onClick={() => goMode("login")}>
                    Log in
                  </button>
                </>
              ) : (
                <>
                  {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => goMode(isSignup ? "login" : "signup")}
                  >
                    {isSignup ? "Log in" : "Sign up"}
                  </button>
                </>
              )}
            </div>

            {isSignup && (
              <p className="auth-legal">
                By creating an account you agree to our <Link to="/legal/terms">Terms</Link> and{" "}
                <Link to="/legal/privacy">Privacy Policy</Link>, and acknowledge the{" "}
                <Link to="/legal/health">Health Disclaimer</Link>.
              </p>
            )}
          </>
        )}

        <div className="auth-footer-links">
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/health">Health Disclaimer</Link>
        </div>
      </form>
    </div>
  );
}
