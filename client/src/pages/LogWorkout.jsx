import { useParams, useSearchParams, Link } from "react-router-dom";
import { useApp, dateKey } from "../context/AppContext.jsx";
import WorkoutLogger from "../components/WorkoutLogger.jsx";
import ExerciseDemo from "../components/ExerciseDemo.jsx";

// Friendly long-form date for a YYYY-MM-DD key.
function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Dedicated logging page for a single day of the workout plan. Reached from the
// "Log workout" buttons on the Workout, Dashboard, and Calendar pages, so those
// stay uncluttered. The day is identified by its index in workoutPlan.days; an
// optional ?date= targets a specific calendar date (defaults to today).
export default function LogWorkout() {
  const { dayIndex } = useParams();
  const [params] = useSearchParams();
  const { workoutPlan } = useApp();
  const idx = Number(dayIndex);
  const day = workoutPlan?.days?.[idx];

  const today = dateKey();
  // Only accept a well-formed date; anything else falls back to today.
  const rawDate = params.get("date");
  const logDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate || "") ? rawDate : today;

  if (!day) {
    return (
      <>
        <div className="page-head">
          <h1>Log Workout</h1>
        </div>
        <div className="card empty">
          <div style={{ fontSize: 40, marginBottom: 10 }}>🏋️</div>
          <p>
            That workout day couldn&apos;t be found — your plan may have changed since this page was
            opened.
          </p>
          <Link className="btn" to="/workout" style={{ marginTop: 12 }}>
            Back to workout plan
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>Log: {day.day}</h1>
            <p>
              {day.focus ? `${day.focus} · ` : ""}Record the weight × reps you actually performed
              {logDate === today ? " today" : ` on ${prettyDate(logDate)}`}.
            </p>
          </div>
          <Link className="btn ghost" to="/workout">
            ← Back to plan
          </Link>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 18 }}>
        <span className={`pill ${day.intensity}`}>
          {day.intensity} · {day.duration_min} min
        </span>
        <span className="pill moderate">{day.exercises.length} exercises</span>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {day.exercises.map((ex, j) => (
          <div key={j} className="card">
            <div className="ex-row">
              <ExerciseDemo name={ex.name} description={ex.notes} meta={`${ex.sets} × ${ex.reps}`} />
              <div className="ex">
                <span className="ex-name">{ex.name}</span>
                <span className="ex-scheme">
                  {ex.sets} × {ex.reps}
                </span>
                {ex.notes && (
                  <span className={`ex-notes ${ex.notes.startsWith("⚠") ? "warn" : ""}`}>
                    {ex.notes}
                  </span>
                )}
              </div>
            </div>
            <WorkoutLogger exercise={ex.name} day={logDate} />
          </div>
        ))}
      </div>
    </>
  );
}
