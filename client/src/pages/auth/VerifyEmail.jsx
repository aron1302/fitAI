import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmailToken } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";

// Public page reached from the verification email link (/verify-email?token=…).
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const { refreshUser } = useAuth();
  const [state, setState] = useState("working"); // working | ok | error
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode's double-invoke: the token is single-use.
    if (ran.current) return;
    ran.current = true;
    const token = params.get("token");
    if (!token) {
      setState("error");
      setError("This verification link is missing its token.");
      return;
    }
    verifyEmailToken(token)
      .then(() => {
        setState("ok");
        refreshUser?.();
      })
      .catch((e) => {
        setState("error");
        setError(e.message);
      });
  }, [params, refreshUser]);

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="brand auth-brand">
          <div className="logo">F</div>
          <div className="brand-text">
            <b>
              Fit<span>AI</span>
            </b>
            <small>Email</small>
          </div>
        </div>
        {state === "working" && <p className="auth-sub">Verifying your email…</p>}
        {state === "ok" && (
          <>
            <h1 className="auth-title">Email verified ✓</h1>
            <p className="auth-sub">Your email address is confirmed. Thanks!</p>
            <Link className="btn" to="/" style={{ marginTop: 14 }}>
              Go to FitAI
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="auth-title">Verification failed</h1>
            <p className="auth-sub">{error}</p>
            <Link className="btn ghost" to="/" style={{ marginTop: 14 }}>
              Back to app
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
