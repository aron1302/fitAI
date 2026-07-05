import { useState } from "react";
import { useApp, dateKey } from "../context/AppContext.jsx";

// Per-exercise set logger shown under each exercise on the Log Workout page.
// Lets the user record the weight × reps they actually performed, shows what
// they did last session for progress, and a running volume total. `day` is the
// date being logged (defaults to today) so the same logger works for a specific
// calendar date.
export default function WorkoutLogger({ exercise, day = dateKey() }) {
  const { workoutLog, logSet, removeSet, lastSession } = useApp();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const sets = workoutLog[day]?.[exercise] || [];
  const last = lastSession(exercise, day);
  const volume = sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);

  // Top weight today vs last session, so we can flag a new best.
  const topToday = Math.max(0, ...sets.map((s) => s.weight || 0));
  const topLast = last ? Math.max(0, ...last.sets.map((s) => s.weight || 0)) : 0;
  const newBest = sets.length > 0 && last && topToday > topLast;

  function add(e) {
    e.preventDefault();
    const r = Number(reps);
    if (!r) return; // reps are required; weight may be 0 for bodyweight moves
    logSet(exercise, { weight: Number(weight) || 0, reps: r }, day);
    setReps("");
    // keep the weight value — sets at the same load are common
  }

  return (
    <div className="logger">
      <div className="logger-head">
        <span className="logger-title">Log sets</span>
        {last && (
          <span className="logger-last" title={`Last logged ${last.date}`}>
            Last: {summarize(last.sets)}
          </span>
        )}
      </div>

      {sets.length > 0 && (
        <div className="logged-sets">
          {sets.map((s, i) => (
            <span key={i} className="set-chip">
              <b>{i + 1}</b>
              {s.weight ? `${s.weight} kg` : "BW"} × {s.reps}
              <button
                type="button"
                className="set-remove"
                title="Remove set"
                onClick={() => removeSet(exercise, i, day)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <form className="log-form" onSubmit={add}>
        <input
          className="log-inp"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="kg"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
        <span className="log-x">×</span>
        <input
          className="log-inp"
          type="number"
          inputMode="numeric"
          min="1"
          placeholder="reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
        />
        <button className="log-add" type="submit">
          + Add set
        </button>
        {volume > 0 && <span className="log-volume">{volume.toLocaleString()} kg volume</span>}
        {newBest && (
          <span className="log-pr" title={`Up from ${topLast} kg last session`}>
            ↑ new top weight
          </span>
        )}
      </form>
    </div>
  );
}

// Compact one-line summary of a session's sets, e.g. "100×8, 100×7, 95×6".
function summarize(sets) {
  return sets.map((s) => `${s.weight ? s.weight : "BW"}×${s.reps}`).join(", ");
}
