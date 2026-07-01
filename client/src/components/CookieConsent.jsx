import { useState } from "react";
import { Link } from "react-router-dom";

const KEY = "fitai.cookieConsent";

// A minimal, honest cookie notice. FitAI uses only strictly-necessary cookies
// (the session cookie and the CSRF token), so this is an acknowledgement rather
// than a tracking-consent gate. If analytics/marketing cookies are ever added,
// this must become a real opt-in with granular categories.
export default function CookieConsent() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const accept = () => {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      // ignore storage failures
    }
    setDismissed(true);
  };

  return (
    <div className="cookie-consent" role="dialog" aria-label="Cookie notice">
      <div className="cookie-text">
        We use only <b>strictly-necessary cookies</b> to keep you signed in and to protect requests
        against CSRF. No advertising or cross-site tracking. See our{" "}
        <Link to="/legal/privacy">Privacy Policy</Link>.
      </div>
      <button className="btn sm" onClick={accept}>
        Got it
      </button>
    </div>
  );
}
