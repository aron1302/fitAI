import { useEffect, useState } from "react";
import { subscribeSync } from "../lib/sync.js";

// Small status pill in the app chrome showing when logged data hasn't reached
// the server yet. Hidden while everything is confirmed; a quiet "Saving…"
// appears only if a save is still pending after a moment (so routine writes
// don't flicker); it turns into an explicit warning once a save has had to
// retry — unsynced training data should never be invisible.
export default function SyncBadge() {
  const [sync, setSync] = useState({ pending: 0, retrying: false });
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeSync(setSync), []);

  const pending = sync.pending > 0;
  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    if (sync.retrying) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(t);
  }, [pending, sync.retrying]);

  if (!visible) return null;
  return (
    <span
      className={`sync-badge${sync.retrying ? " warn" : ""}`}
      role="status"
      title={
        sync.retrying
          ? "The server hasn't confirmed your latest changes yet. They're saved on this device and will sync automatically — keep the app open."
          : "Saving your changes to the server…"
      }
    >
      <span className={`dot ${sync.retrying ? "off" : "on"}`} />
      {sync.retrying ? "Not synced — retrying" : "Saving…"}
    </span>
  );
}
