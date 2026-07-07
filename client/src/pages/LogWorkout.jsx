import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useApp, dateKey } from "../context/AppContext.jsx";
import { workoutCalories } from "../lib/calc.js";
import { getDaySets } from "../lib/workoutLog.js";
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

// Stopwatch-style elapsed time: "12:07", or "1:02:07" past the hour.
function fmtElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// Spoken form for the summary, e.g. "1 h 02 min" / "38 min".
function fmtMinutes(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min` : `${mins} min`;
}

// Dedicated logging page for a single day of the workout plan. Reached from the
// "Log workout" buttons on the Workout, Dashboard, and Calendar pages. When the
// page is opened for today, a session timer starts automatically; "End workout"
// (after a confirmation) stops it and swaps the loggers for a stats dashboard +
// per-exercise summary of the session. Past dates keep the plain retro-logging
// view — timing a workout that already happened makes no sense.
export default function LogWorkout() {
  const { dayIndex } = useParams();
  const [params] = useSearchParams();
  const {
    workoutPlan,
    profile,
    workoutLog,
    stateLoaded,
    workoutSessions,
    startWorkoutSession,
    endWorkoutSession,
    resumeWorkoutSession,
  } = useApp();
  const idx = Number(dayIndex);
  const day = workoutPlan?.days?.[idx];

  const today = dateKey();
  // Only accept a well-formed date; anything else falls back to today.
  const rawDate = params.get("date");
  const logDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate || "") ? rawDate : today;
  const isToday = logDate === today;

  const sessionKey = `${logDate}#${idx}`;
  const session = workoutSessions[sessionKey];
  const running = !!session && !session.endedAt;
  const ended = !!session?.endedAt;

  const [confirmEnd, setConfirmEnd] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Start the session clock the first time today's page opens. Waits for server
  // hydration so a fresh tab doesn't race the stored start time, and is a no-op
  // when a session (running or ended) already exists.
  const hasDay = !!day;
  useEffect(() => {
    if (!stateLoaded || !hasDay || !isToday) return;
    startWorkoutSession(sessionKey);
  }, [stateLoaded, hasDay, isToday, sessionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick once a second while the timer runs.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Close the confirm dialog with Escape.
  useEffect(() => {
    if (!confirmEnd) return;
    const onKey = (e) => e.key === "Escape" && setConfirmEnd(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmEnd]);

  // Logged sets are keyed by exercise name. If a day somehow holds several
  // exercises with the same name (e.g. rows added but never renamed), suffix the
  // repeats so each card logs into its own bucket instead of all sharing one.
  const seen = new Map();
  const logKeys = (day?.exercises || []).map((ex) => {
    const name = ex.name?.trim() || "Exercise";
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} (${n})`;
  });

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

  // Session stats, computed live from the day's logged sets.
  const perExercise = day.exercises.map((ex, j) => {
    const sets = getDaySets(workoutLog, logDate, logKeys[j]);
    return {
      name: ex.name,
      scheme: `${ex.sets} × ${ex.reps}`,
      sets,
      volume: sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0),
    };
  });
  const totalSets = perExercise.reduce((n, e) => n + e.sets.length, 0);
  const totalVolume = perExercise.reduce((n, e) => n + e.volume, 0);
  const exercisesDone = perExercise.filter((e) => e.sets.length > 0).length;

  const elapsedMs = session ? (session.endedAt || now) - session.startedAt : 0;
  const calories = session ? workoutCalories(profile, day.intensity, elapsedMs / 60000) : 0;

  function finishWorkout() {
    endWorkoutSession(sessionKey);
    setConfirmEnd(false);
    window.scrollTo(0, 0);
  }

  // ---- Post-workout view: stats dashboard + session summary ----
  if (ended) {
    return (
      <>
        <div className="page-head">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1>Workout complete 🎉</h1>
              <p>
                {day.day}
                {day.focus ? ` · ${day.focus}` : ""} — here&apos;s how the session went.
              </p>
            </div>
            <Link className="btn ghost" to="/workout">
              ← Back to plan
            </Link>
          </div>
        </div>

        <div className="grid cols-4">
          <div className="card stat">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="label">Time taken</span>
              <span className="icon tint-cyan">⏱</span>
            </div>
            <div className="value">{fmtElapsed(elapsedMs)}</div>
            <div className="sub">planned {day.duration_min} min</div>
          </div>
          <div className="card stat">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="label">Calories burned</span>
              <span className="icon tint-amber">🔥</span>
            </div>
            <div className="value">
              {calories.toLocaleString()}
              <small> kcal</small>
            </div>
            <div className="sub">estimated · {day.intensity} intensity</div>
          </div>
          <div className="card stat">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="label">Sets logged</span>
              <span className="icon tint-green">✅</span>
            </div>
            <div className="value">{totalSets}</div>
            <div className="sub">
              {exercisesDone} of {day.exercises.length} exercises
            </div>
          </div>
          <div className="card stat">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="label">Volume lifted</span>
              <span className="icon tint-violet">🏋️</span>
            </div>
            <div className="value">
              {totalVolume.toLocaleString()}
              <small> kg</small>
            </div>
            <div className="sub">weight × reps, all sets</div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-title-row">
            <h3>Workout summary</h3>
            <span className={`pill ${day.intensity}`}>{day.intensity}</span>
          </div>
          <p className="session-recap">
            You trained for <b>{fmtMinutes(elapsedMs)}</b>
            {isToday ? "" : ` on ${prettyDate(logDate)}`}, completing{" "}
            <b>
              {exercisesDone} of {day.exercises.length}
            </b>{" "}
            exercises with <b>{totalSets}</b> sets
            {totalVolume > 0 && (
              <>
                {" "}
                and <b>{totalVolume.toLocaleString()} kg</b> of total volume
              </>
            )}
            {" — "}an estimated <b>{calories.toLocaleString()} kcal</b> burned.
          </p>
          <div className="session-exercises">
            {perExercise.map((ex, j) => (
              <div key={j} className={`session-ex${ex.sets.length ? "" : " skipped"}`}>
                <div className="ex">
                  <span className="ex-name">{ex.name}</span>
                  <span className="ex-scheme">planned {ex.scheme}</span>
                </div>
                <div className="session-ex-sets">
                  {ex.sets.length ? (
                    <>
                      <span>
                        {ex.sets
                          .map((s) => `${s.weight ? `${s.weight} kg` : "BW"} × ${s.reps}`)
                          .join(", ")}
                      </span>
                      {ex.volume > 0 && (
                        <span className="muted"> · {ex.volume.toLocaleString()} kg</span>
                      )}
                    </>
                  ) : (
                    <span className="muted">Not logged</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 18 }}>
          <Link className="btn" to="/">
            Done — back to dashboard
          </Link>
          {/* Resuming only makes sense while it's still the session's day. */}
          {isToday && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => resumeWorkoutSession(sessionKey)}
            >
              ↩ Resume workout
            </button>
          )}
        </div>
      </>
    );
  }

  // ---- Logging view (timer runs for today's session) ----
  return (
    <>
      <div className="page-head">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>Log: {day.day}</h1>
            <p>
              {day.focus ? `${day.focus} · ` : ""}Record the weight × reps you actually performed
              {isToday ? " today" : ` on ${prettyDate(logDate)}`}.
            </p>
          </div>
          <Link className="btn ghost" to="/workout">
            ← Back to plan
          </Link>
        </div>
      </div>

      {session && (
        <div className="session-bar">
          <div className="session-status">
            <span className="session-dot" />
            <span className="session-label">Workout in progress</span>
            <span className="session-time">{fmtElapsed(elapsedMs)}</span>
          </div>
          <button type="button" className="btn danger-solid sm" onClick={() => setConfirmEnd(true)}>
            ■ End workout
          </button>
        </div>
      )}

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
              <ExerciseDemo
                name={ex.name}
                description={ex.notes}
                meta={`${ex.sets} × ${ex.reps}`}
              />
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
            <WorkoutLogger exercise={logKeys[j]} day={logDate} />
          </div>
        ))}
      </div>

      {session && (
        <div className="row" style={{ marginTop: 18, justifyContent: "center" }}>
          <button type="button" className="btn danger-solid" onClick={() => setConfirmEnd(true)}>
            ■ End workout · {fmtElapsed(elapsedMs)}
          </button>
        </div>
      )}

      {confirmEnd && (
        <div className="modal-overlay" onClick={() => setConfirmEnd(false)}>
          <div
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-label="End workout confirmation"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏁</div>
            <h3>End this workout?</h3>
            <p>
              Are you sure you want to end this workout? The timer stops at{" "}
              <b>{fmtElapsed(elapsedMs)}</b> and you&apos;ll see your session stats and summary.
            </p>
            <div className="row" style={{ gap: 10, justifyContent: "center", marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setConfirmEnd(false)}>
                Keep training
              </button>
              <button type="button" className="btn danger-solid" onClick={finishWorkout}>
                End workout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
