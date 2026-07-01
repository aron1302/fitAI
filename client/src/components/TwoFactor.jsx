import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { start2faSetup, enable2fa, disable2fa, regenerateRecoveryCodes } from "../lib/api.js";

// Two-factor (TOTP) enrollment & management, shown inside Privacy & Security.
export default function TwoFactor() {
  const { user, refreshUser } = useAuth();
  const enabled = !!user?.twoFactorEnabled;
  const [phase, setPhase] = useState("idle"); // idle | setup | codes | disable | regen
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setPhase("idle");
    setSetupData(null);
    setCode("");
    setCodes(null);
    setError("");
  };

  const run = (fn) => async () => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const begin = run(async () => {
    setSetupData(await start2faSetup());
    setPhase("setup");
  });
  const confirm = run(async () => {
    const rc = await enable2fa(code.trim());
    setCodes(rc);
    setCode("");
    setPhase("codes");
    await refreshUser?.();
  });
  const doDisable = run(async () => {
    await disable2fa(code.trim());
    reset();
    await refreshUser?.();
  });
  const doRegen = run(async () => {
    const rc = await regenerateRecoveryCodes(code.trim());
    setCodes(rc);
    setCode("");
    setPhase("codes");
  });

  const downloadCodes = () => {
    const blob = new Blob([`FitAI recovery codes\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fitai-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sec-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sec-title">
          Two-factor authentication {enabled && <span className="tfa-on">On</span>}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          {enabled
            ? "An authenticator code is required when you log in."
            : "Add a one-time code from an authenticator app for stronger account security."}
        </div>

        {phase === "setup" && setupData && (
          <div className="tfa-setup">
            <ol className="tfa-steps">
              <li>Scan this QR code in an authenticator app (Google Authenticator, Authy, 1Password…).</li>
              <li>
                Or enter this key manually: <code className="tfa-secret">{setupData.secret}</code>
              </li>
              <li>Enter the 6-digit code it shows to finish:</li>
            </ol>
            <img className="tfa-qr" src={setupData.qr} alt="Two-factor QR code" width="168" height="168" />
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <input
                className="edit-inp sm"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                style={{ width: 120 }}
              />
              <button className="btn sm" disabled={busy} onClick={confirm}>
                Verify &amp; enable
              </button>
              <button className="btn ghost sm" onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === "codes" && codes && (
          <div className="tfa-codes">
            <b>Save your recovery codes</b>
            <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
              Each can be used once if you lose your device. Store them somewhere safe — they won't
              be shown again.
            </p>
            <div className="tfa-code-grid">
              {codes.map((c) => (
                <code key={c}>{c}</code>
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn ghost sm" onClick={downloadCodes}>
                Download
              </button>
              <button className="btn sm" onClick={reset}>
                Done
              </button>
            </div>
          </div>
        )}

        {phase === "disable" && (
          <div className="tfa-setup">
            <p className="muted" style={{ fontSize: 13 }}>
              Enter a current authentication or recovery code to turn off 2FA.
            </p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                className="edit-inp sm"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456 or recovery code"
                style={{ width: 200 }}
              />
              <button className="btn sm danger-solid" disabled={busy} onClick={doDisable}>
                Disable 2FA
              </button>
              <button className="btn ghost sm" onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === "regen" && (
          <div className="tfa-setup">
            <p className="muted" style={{ fontSize: 13 }}>
              Enter a current authentication code. This invalidates your old recovery codes.
            </p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                className="edit-inp sm"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                style={{ width: 120 }}
              />
              <button className="btn sm" disabled={busy} onClick={doRegen}>
                Regenerate
              </button>
              <button className="btn ghost sm" onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, marginTop: 8, color: "var(--danger)" }}>{error}</div>
        )}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {!enabled && phase === "idle" && (
          <button className="btn ghost sm" disabled={busy} onClick={begin}>
            Enable 2FA
          </button>
        )}
        {enabled && phase === "idle" && (
          <>
            <button className="btn ghost sm" onClick={() => setPhase("regen")}>
              New recovery codes
            </button>
            <button className="btn ghost sm danger" onClick={() => setPhase("disable")}>
              Disable
            </button>
          </>
        )}
      </div>
    </div>
  );
}
