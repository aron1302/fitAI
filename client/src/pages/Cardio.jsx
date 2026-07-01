import { useApp } from "../context/AppContext.jsx";
import { readinessBand } from "../lib/calc.js";
import { cardioSuggestions } from "../lib/cardio.js";
import AddToCalendar from "../components/AddToCalendar.jsx";

export default function Cardio() {
  const { profile, recoveryPayload } = useApp();
  const c = cardioSuggestions(profile, recoveryPayload);

  return (
    <>
      <div className="page-head">
        <h1>Cardio</h1>
        <p>
          Heart-rate zones and weekly sessions tuned to your age, resting heart rate, goal, and
          today's readiness.
        </p>
      </div>

      {c.senior && (
        <div className="callout" style={{ marginBottom: 18 }}>
          <b>For your age group (50+):</b> {c.ageGuidance}
        </div>
      )}

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <span className="label">Age</span>
          <div className="value">
            {c.age}
            <small> yrs</small>
          </div>
        </div>
        <div className="card stat">
          <span className="label">Readiness</span>
          <div className="value" style={{ color: "var(--accent)" }}>
            {c.readiness}
            <small> /100 · {readinessBand(c.readiness)}</small>
          </div>
        </div>
        <div className="card stat">
          <span className="label">Max heart rate</span>
          <div className="value">
            {c.hrMax}
            <small> bpm</small>
          </div>
        </div>
        <div className="card stat">
          <span className="label">Resting HR</span>
          <div className="value">
            {c.restingHr}
            <small> bpm</small>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title-row">
          <h3>Your heart-rate zones</h3>
          <span className="engine-tag">Karvonen method</span>
        </div>
        <p className="muted" style={{ fontSize: 13.5, margin: "0 0 12px" }}>
          {c.summary} Zones above Zone {c.maxZone} are dimmed — they're more than your body needs
          today.
        </p>
        {c.zones.map((z) => {
          const recommended = z.z <= c.maxZone;
          return (
            <div key={z.z} className="ex" style={{ opacity: recommended ? 1 : 0.4 }}>
              <span className="ex-name">
                Zone {z.z} · {z.name}
              </span>
              <span className="ex-scheme">
                {z.low}–{z.high} bpm
              </span>
              <span className="ex-notes">{z.purpose}</span>
            </div>
          );
        })}
      </div>

      <div className="card-title-row" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>This week's sessions</h3>
      </div>
      <div className="grid cols-2">
        {c.sessions.map((s, i) => (
          <div key={i} className="card day-card">
            <div className="day-head">
              <span className="focus">{s.title}</span>
              <span className="pill moderate">
                Zone {s.zone} · {s.duration_min} min
              </span>
            </div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{s.type}</div>
            <div className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
              {s.detail}
            </div>
            <div style={{ marginTop: 12 }}>
              <AddToCalendar type="cardio" title={`${s.title} · ${s.type} · ${s.duration_min} min`} />
            </div>
          </div>
        ))}
      </div>

      <div className="callout" style={{ marginTop: 18 }}>
        🎯 Aim for about <b>{c.weeklyMinutes} minutes</b> of cardio per week and{" "}
        <b>{c.stepGoal.toLocaleString()} steps</b> a day. Brisk walking counts.
      </div>

      <div className="callout warn" style={{ marginTop: 12 }}>
        <b>Stay safe:</b>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
          {c.cautions.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
