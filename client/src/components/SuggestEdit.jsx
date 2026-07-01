import { useState } from "react";
import { suggestPlanEdit } from "../lib/api.js";
import { useApp } from "../context/AppContext.jsx";

// A natural-language box: the user proposes a change, the AI judges whether it
// fits their goals and either applies it (calls setPlan) or declines with a reason.
export default function SuggestEdit({ kind, plan, setPlan, placeholder }) {
  const { profile, recoveryPayload } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { approved, reason }

  async function submit(e) {
    e.preventDefault();
    const suggestion = text.trim();
    if (!suggestion || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await suggestPlanEdit({
        kind,
        plan,
        suggestion,
        profile,
        recovery: recoveryPayload,
      });
      if (res.approved && res.plan) setPlan({ ...res.plan, _edited: true });
      setResult({ approved: res.approved, reason: res.reason });
      if (res.approved) setText("");
    } catch (err) {
      setResult({
        approved: false,
        reason: "Couldn't reach the AI. Make sure the server is running.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-title-row">
        <h3>💡 Suggest a change</h3>
        <span className="engine-tag">AI reviews &amp; applies if suitable</span>
      </div>
      <form className="row" style={{ gap: 10 }} onSubmit={submit}>
        <input
          className="edit-inp"
          style={{ flex: 1 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={busy}
        />
        <button className="btn" type="submit" disabled={busy || !text.trim()}>
          {busy ? (
            <>
              <span className="spinner" /> Reviewing…
            </>
          ) : (
            "Ask AI"
          )}
        </button>
      </form>
      {result && (
        <div className={`callout ${result.approved ? "" : "warn"}`} style={{ marginTop: 14 }}>
          {result.approved ? "✅ Applied: " : "🤔 Not applied: "}
          {result.reason}
        </div>
      )}
    </div>
  );
}
