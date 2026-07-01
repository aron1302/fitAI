import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

// Soft gate: shown across the app while the logged-in user's email is unverified.
// Doesn't block usage, but keeps the prompt (and resend) one click away.
export default function VerifyBanner() {
  const { user, resendVerification, refreshUser } = useAuth();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user || user.emailVerified) return null;

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

  return (
    <div className="verify-banner">
      <span>
        📧 Please verify your email (<b>{user.email}</b>) to secure your account.
      </span>
      <span className="verify-actions">
        <button className="btn ghost sm" disabled={busy} onClick={resend}>
          Resend email
        </button>
        <button className="btn ghost sm" onClick={() => refreshUser?.()}>
          I&apos;ve verified
        </button>
      </span>
      {msg && <span className="verify-msg">{msg}</span>}
    </div>
  );
}
