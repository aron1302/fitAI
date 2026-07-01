import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchSessions, exportAccount } from "../lib/api.js";
import TwoFactor from "./TwoFactor.jsx";

// Profile section: active-session management, data export, and account deletion.
export default function PrivacySecurity() {
  const { logoutEverywhere, logoutOtherDevices, deleteAccount } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState("");

  const loadSessions = () => fetchSessions().then(setSessions);
  useEffect(() => {
    loadSessions();
  }, []);

  const onExport = async () => {
    setBusy("export");
    setMsg("");
    try {
      await exportAccount();
      setMsg("Your data export has downloaded.");
    } catch {
      setMsg("Export failed — please try again.");
    } finally {
      setBusy("");
    }
  };
  const onLogoutOthers = async () => {
    setBusy("others");
    setMsg("");
    try {
      await logoutOtherDevices();
      await loadSessions();
      setMsg("Signed out all other devices.");
    } catch {
      setMsg("Could not sign out other devices.");
    } finally {
      setBusy("");
    }
  };
  const onLogoutAll = async () => {
    setBusy("all");
    try {
      await logoutEverywhere(); // signs out here too -> back to login
    } catch {
      setBusy("");
    }
  };
  const onDelete = async () => {
    if (confirmText !== "DELETE") return;
    setBusy("delete");
    try {
      await deleteAccount(); // signs out -> back to login
    } catch {
      setMsg("Deletion failed — please try again.");
      setBusy("");
    }
  };

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-title-row">
        <h3>Privacy &amp; Security</h3>
      </div>

      <p className="muted" style={{ fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.6 }}>
        When an AI provider is enabled, your profile and coach messages are sent to it to generate
        plans and responses. With the local or rule-based engine, nothing leaves the server. See our{" "}
        <Link to="/legal/privacy">Privacy Policy</Link> and{" "}
        <Link to="/legal/health">Health Disclaimer</Link>.
      </p>

      <div className="sec-row">
        <div>
          <div className="sec-title">Active sessions</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {sessions == null
              ? "Loading…"
              : `${sessions.count} active session${sessions.count === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost sm" disabled={busy === "others"} onClick={onLogoutOthers}>
            Log out other devices
          </button>
          <button className="btn ghost sm danger" disabled={busy === "all"} onClick={onLogoutAll}>
            Log out everywhere
          </button>
        </div>
      </div>

      <TwoFactor />

      <div className="sec-row">
        <div>
          <div className="sec-title">Your data</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Download everything we hold about you, or permanently delete your account.
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost sm" disabled={busy === "export"} onClick={onExport}>
            Export my data
          </button>
          {!confirmDelete && (
            <button className="btn ghost sm danger" onClick={() => setConfirmDelete(true)}>
              Delete account
            </button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="sec-danger">
          <b>Delete your account?</b> This permanently removes your profile, plans, logs, calendar,
          and history. This cannot be undone. Type <b>DELETE</b> to confirm.
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <input
              className="edit-inp sm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              style={{ width: 120 }}
            />
            <button
              className="btn sm danger-solid"
              disabled={confirmText !== "DELETE" || busy === "delete"}
              onClick={onDelete}
            >
              Permanently delete
            </button>
            <button
              className="btn ghost sm"
              onClick={() => {
                setConfirmDelete(false);
                setConfirmText("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
