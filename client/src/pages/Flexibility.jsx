import { useApp } from "../context/AppContext.jsx";
import { readinessBand } from "../lib/calc.js";
import { flexibilitySuggestions } from "../lib/flexibility.js";
import ExerciseDemo from "../components/ExerciseDemo.jsx";
import AddToCalendar from "../components/AddToCalendar.jsx";

export default function Flexibility() {
  const { profile, recoveryPayload } = useApp();
  const f = flexibilitySuggestions(profile, recoveryPayload);

  return (
    <>
      <div className="page-head">
        <h1>Flexibility & Mobility</h1>
        <p>
          A mobility routine tuned to your age, soreness, and any injuries — to keep your joints
          supple and moving well.
        </p>
      </div>

      {f.senior && (
        <div className="callout" style={{ marginBottom: 18 }}>
          <b>For your age group (50+):</b> {f.ageGuidance}
        </div>
      )}

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <span className="label">Age</span>
          <div className="value">
            {f.age}
            <small> yrs</small>
          </div>
        </div>
        <div className="card stat">
          <span className="label">Readiness</span>
          <div className="value" style={{ color: "var(--accent)" }}>
            {f.readiness}
            <small> /100 · {readinessBand(f.readiness)}</small>
          </div>
        </div>
        <div className="card stat">
          <span className="label">Soreness</span>
          <div className="value">
            {f.soreness}
            <small> /5</small>
          </div>
        </div>
        <div className="card stat">
          <span className="label">Frequency</span>
          <div className="value" style={{ fontSize: 18 }}>
            {f.frequency}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title-row">
          <h3>Focus areas</h3>
        </div>
        <p className="muted" style={{ fontSize: 13.5, margin: "0 0 12px" }}>
          {f.summary}
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {f.focusAreas.map((area, i) => (
            <span key={i} className="pill moderate">
              {area}
            </span>
          ))}
        </div>
      </div>

      <div className="card-title-row" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Your routine</h3>
      </div>
      <div className="grid cols-2">
        {f.routine.map((d, i) => (
          <div key={i} className="card day-card">
            <div className="day-head">
              <span className="focus">{d.name}</span>
              <span className="pill moderate">{d.type}</span>
            </div>
            <div className="ex-row">
              <ExerciseDemo
                name={d.name}
                description={d.detail}
                meta={`${d.target} · ${d.prescription}`}
              />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {d.target} · <span style={{ color: "var(--accent-2)" }}>{d.prescription}</span>
                </div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {d.detail}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <AddToCalendar type="flexibility" title={`${d.name} · ${d.prescription}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="callout warn" style={{ marginTop: 18 }}>
        <b>Stay safe:</b>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
          {f.cautions.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
