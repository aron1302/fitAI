import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { connectFitbit, disconnectFitbit } from "../lib/api.js";

// "Connected devices" panel for the Profile page. Fitbit connects for real
// (OAuth); Garmin and Apple Watch are listed with an honest explanation of what
// they'd need, so testers aren't left wondering.

const PROVIDERS = [
  {
    id: "fitbit",
    name: "Fitbit",
    desc: "Steps, calories and active minutes, synced automatically.",
  },
  {
    id: "garmin",
    name: "Garmin",
    desc: "Coming soon — waiting on Garmin developer-program approval.",
  },
  {
    id: "apple_health",
    name: "Apple Watch / Apple Health",
    desc: "Needs a native iOS app — Apple doesn't offer a web API for Health data.",
  },
];

export default function ConnectedDevices() {
  const { trackers, refreshTrackers, syncActivity } = useApp();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: "ok" | "err", text }

  // Returning from the Fitbit consent screen: show the outcome once, then
  // clean the query param so refreshes don't repeat it.
  useEffect(() => {
    const outcome = params.get("tracker");
    if (!outcome) return;
    if (outcome === "connected") {
      setMsg({ kind: "ok", text: "Fitbit connected! Today's activity will sync now." });
      refreshTrackers();
      syncActivity().catch(() => {});
    } else {
      setMsg({ kind: "err", text: "Fitbit connection failed — please try again." });
    }
    params.delete("tracker");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync() {
    setBusy(true);
    setMsg(null);
    try {
      const row = await syncActivity();
      setMsg({ kind: "ok", text: `Synced — ${row.steps.toLocaleString()} steps today.` });
    } catch (e) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Fitbit? Your synced history stays in your account.")) return;
    setBusy(true);
    setMsg(null);
    try {
      await disconnectFitbit();
      await refreshTrackers();
      setMsg({ kind: "ok", text: "Fitbit disconnected." });
    } catch (e) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-title-row">
        <h3>Connected Devices</h3>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Connect a fitness tracker to replace the dashboard's estimated steps and calories with
        real data from your wrist.
      </p>

      {msg && (
        <div
          className="banner"
          style={msg.kind === "err" ? { borderColor: "var(--danger)", color: "var(--danger)" } : {}}
        >
          {msg.text}
        </div>
      )}

      {PROVIDERS.map((p) => {
        const info = trackers?.[p.id];
        const connected = info?.connected;
        const available = info?.available ?? false;
        return (
          <div
            key={p.id}
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "12px 0",
              borderTop: "1px solid var(--bg-2)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 200, flex: 1 }}>
              <b style={{ fontSize: 14 }}>{p.name}</b>{" "}
              {connected && (
                <span className="engine-tag" style={{ marginLeft: 6 }}>
                  connected
                </span>
              )}
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {p.desc}
                {p.id === "fitbit" && !available && info?.note ? ` ${info.note}` : ""}
              </div>
            </div>
            {p.id === "fitbit" &&
              (connected ? (
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ghost" disabled={busy} onClick={handleSync}>
                    {busy ? "…" : "Sync now"}
                  </button>
                  <button className="btn ghost" disabled={busy} onClick={handleDisconnect}>
                    Disconnect
                  </button>
                </div>
              ) : (
                <button className="btn" disabled={!available || busy} onClick={connectFitbit}>
                  Connect
                </button>
              ))}
            {p.id !== "fitbit" && (
              <button className="btn ghost" disabled>
                Not yet available
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
