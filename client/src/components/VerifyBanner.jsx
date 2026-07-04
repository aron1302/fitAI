import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

// Soft gate: shown across the app while the logged-in user's email is unverified.
// Doesn't block usage, but keeps the prompt (and resend) one click away.
// Dismisses itself automatically: it re-checks verification whenever the tab
// regains focus (the user typically verifies in another tab) and on a slow
// background poll, so the banner disappears without any click needed.
export default function VerifyBanner() {
  const { user, resendVerification, refreshUser } = useAuth();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const unverified = Boolean(user && !user.emailVerified);

  // Keep a stable reference so the listener effect doesn't re-subscribe every
  // render (refreshUser gets a new identity on each AuthContext render).
  const refreshRef = useRef(refreshUser);
  useEffect(() => {
    refreshRef.current = refreshUser;
  });

  useEffect(() => {
    if (!unverified) return;
    const check = () => refreshRef.current?.().catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 30000);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [unverified]);

  if (!unverified) return null;

  const resend = async () => {
    setBusy(true);
    setMsg("");
    try {
      await resendVerification();
      setMsg("Verification email sent — check your inbox.");
    } catch {
      setMsg("Couldn't send right now — please try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  // Re-check now; if the address is verified the fresh user state unmounts the
  // banner, otherwise tell the user what's still missing.
  const checkVerified = async () => {
    setBusy(true);
    setMsg("");
    try {
      const u = await refreshUser();
      if (u && !u.emailVerified) {
        setMsg("Not verified yet — click the link in the email we sent, then try again.");
      }
    } catch {
      setMsg("Couldn't check right now — please try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="verify-banner">
      <span>
        📧 Please verify your email (<b>{user.email}</b>) to secure your account.
      </span>
      <span className="verify-actions">
        <button className="btn ghost sm" disabled={busy} onClick={resend}>
          Resend email
        </button>
        <button className="btn ghost sm" disabled={busy} onClick={checkVerified}>
          {busy ? "Checking…" : "I've verified"}
        </button>
      </span>
      {msg && <span className="verify-msg">{msg}</span>}
    </div>
  );
}
