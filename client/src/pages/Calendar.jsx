import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp, dateKey } from "../context/AppContext.jsx";
import {
  engineLabel,
  workoutForDate,
  effectiveWorkoutForDate,
  ACTIVITY_TYPES,
  activityType,
} from "../lib/calc.js";
import ExerciseHistory from "../components/ExerciseHistory.jsx";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Read-only render of an archived workout plan.
function WorkoutView({ plan }) {
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title-row">
        <h3>🏋 Workout — {plan.summary || "Plan"}</h3>
        <span className="engine-tag">
          {plan._edited ? "✎ Edited by you" : engineLabel(plan._engine)}
        </span>
      </div>
      <div className="grid cols-2">
        {plan.days?.map((d, i) => (
          <div key={i} className="card day-card">
            <div className="day-head">
              <span className="focus">{d.day}</span>
              <span className={`pill ${d.intensity}`}>
                {d.intensity} · {d.duration_min} min
              </span>
            </div>
            {d.exercises?.map((ex, j) => (
              <div key={j} className="ex">
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
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Read-only render of a single scheduled training day (one day of the plan).
// `dayIndex` is its position in workoutPlan.days; `logDate` / `canLog` drive the
// "Log workout" link, which is offered for today or past days (you log what you
// actually did).
function ScheduledDayView({ day, dayIndex, upcoming, added, logDate, canLog, onRemove }) {
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title-row">
        <h3>
          🏋 {day.focus || day.day}
          {day.day && day.focus && day.day !== day.focus ? ` — ${day.day}` : ""}
        </h3>
        <span className={`pill ${day.intensity || "moderate"}`}>
          {added ? "Added by you" : upcoming ? "Upcoming" : "Scheduled"}
          {day.duration_min ? ` · ${day.duration_min} min` : ""}
        </span>
      </div>
      {day.exercises?.length ? (
        <div className="day-card" style={{ background: "none", border: "none", padding: 0 }}>
          {day.exercises.map((ex, j) => (
            <div key={j} className="ex">
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
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No exercises listed for this day.
        </p>
      )}
      <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
        <Link to="/workout" className="btn ghost sm">
          Open in Workout →
        </Link>
        {canLog && dayIndex >= 0 && (
          <Link to={`/workout/log/${dayIndex}?date=${logDate}`} className="btn sm">
            ✎ Log workout
          </Link>
        )}
        {onRemove && (
          <button className="btn ghost sm danger" onClick={onRemove}>
            Remove from calendar
          </button>
        )}
      </div>
    </div>
  );
}

// Read-only render of an archived diet plan.
function DietView({ plan }) {
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title-row">
        <h3>🍽 Meals — {(plan.daily_calories || 0).toLocaleString()} kcal</h3>
        <span className="engine-tag">
          {plan._edited ? "✎ Edited by you" : engineLabel(plan._engine)}
        </span>
      </div>
      <div className="grid cols-2">
        {plan.meals?.map((m, i) => (
          <div key={i} className="card">
            <div className="meal-head">
              <span className="mname">{m.name}</span>
              <span className="mtime">{m.time}</span>
            </div>
            <div className="meal-items">
              {m.items?.map((it, j) => (
                <div key={j}>• {it}</div>
              ))}
            </div>
            <div className="meal-macros">
              {m.calories} kcal · {m.protein_g}g protein
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Activity types that map to a dedicated page, shown as a quick link.
const ACTIVITY_LINKS = {
  cardio: { to: "/cardio", label: "Open Cardio →" },
  flexibility: { to: "/flexibility", label: "Open Flexibility →" },
};

// Lists a day's user-added activities and lets the user add or remove them.
function ActivitiesCard({ date, activities, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("cardio");
  const [title, setTitle] = useState("");

  const submit = (e) => {
    e.preventDefault();
    onAdd(date, { type, title: title.trim() });
    setTitle("");
    setType("cardio");
    setAdding(false);
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title-row">
        <h3>Activities</h3>
        <button className="btn ghost sm" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add activity"}
        </button>
      </div>

      {adding && (
        <form className="activity-form" onSubmit={submit}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Details (e.g. 5k easy run) — optional"
          />
          <button className="btn sm" type="submit">
            Add
          </button>
        </form>
      )}

      {activities.length === 0 ? (
        <p className="muted" style={{ fontSize: 13.5, margin: "8px 0 0" }}>
          No extra activities for this day. Add a run, mobility session, or anything else you did.
        </p>
      ) : (
        <div className="activity-list">
          {activities.map((a) => {
            const cfg = activityType(a.type);
            const link = ACTIVITY_LINKS[a.type];
            return (
              <div key={a.id} className="activity-row">
                <span className="activity-dot" style={{ background: cfg.color }} />
                <div className="activity-main">
                  <span className="activity-type">{cfg.label}</span>
                  {a.title && <span className="activity-title">{a.title}</span>}
                </div>
                {link && (
                  <Link to={link.to} className="activity-link">
                    {link.label}
                  </Link>
                )}
                <button
                  className="icon-btn"
                  title="Remove activity"
                  onClick={() => onRemove(date, a.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The sets actually logged on a date (from the workout log), one block per
// exercise, with a per-exercise "History" opening the full cross-session
// comparison for that movement.
function LoggedWorkoutCard({ date, dayLog }) {
  const [hxExercise, setHxExercise] = useState(null);
  const entries = Object.entries(dayLog);
  const volume = (sets) => sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
  const total = entries.reduce((sum, [, sets]) => sum + volume(sets), 0);

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title-row">
        <h3>✓ Logged workout</h3>
        {total > 0 && <span className="engine-tag">{total.toLocaleString()} kg total volume</span>}
      </div>
      {entries.map(([name, sets]) => (
        <div key={name} className="hx-ex">
          <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span className="ex-name">{name}</span>
            <span className="row" style={{ gap: 10, alignItems: "baseline" }}>
              {volume(sets) > 0 && (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {volume(sets).toLocaleString()} kg vol
                </span>
              )}
              <button
                type="button"
                className="btn ghost sm"
                style={{ padding: "3px 9px", fontSize: 12 }}
                onClick={() => setHxExercise(name)}
              >
                📈 History
              </button>
            </span>
          </div>
          <div className="hx-sets">
            {sets.map((s, i) => (
              <span key={i} className="set-chip">
                <b>{i + 1}</b>
                {s.weight ? `${s.weight} kg` : "BW"} × {s.reps}
              </span>
            ))}
          </div>
        </div>
      ))}
      {hxExercise && (
        <ExerciseHistory
          exercise={hxExercise}
          baselineDay={date}
          onClose={() => setHxExercise(null)}
        />
      )}
    </div>
  );
}

// Offered on rest days: pick one of the plan's sessions and place it on this
// date. The added session then behaves like a scheduled one (loggable, shown on
// the month grid) and can be removed again.
function AddWorkoutCard({ plan, onAdd }) {
  const [idx, setIdx] = useState(0);
  const label = (d) => (d.focus && d.focus !== d.day ? `${d.day} — ${d.focus}` : d.day);
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title-row">
        <h3>Add a workout</h3>
      </div>
      <p className="muted" style={{ fontSize: 13.5, margin: "0 0 10px" }}>
        Nothing scheduled here — add one of your plan&apos;s sessions to this day.
      </p>
      <form
        className="activity-form"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(Number(idx));
        }}
      >
        <select value={idx} onChange={(e) => setIdx(e.target.value)}>
          {plan.days.map((d, i) => (
            <option key={i} value={i}>
              {label(d)}
            </option>
          ))}
        </select>
        <button className="btn sm" type="submit">
          + Add workout
        </button>
      </form>
    </div>
  );
}

// Shown when the user has removed the auto-scheduled workout for a day.
function RemovedWorkoutNote({ day, onRestore }) {
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
      >
        <div className="muted" style={{ fontSize: 14 }}>
          <b style={{ color: "var(--text)" }}>{day.focus || day.day}</b> workout was removed from
          this day.
        </div>
        <button className="btn ghost sm" onClick={onRestore}>
          Restore workout
        </button>
      </div>
    </div>
  );
}

export default function Calendar() {
  const {
    history,
    workoutPlan,
    profile,
    calendar,
    workoutLog,
    addActivity,
    removeActivity,
    setWorkoutHidden,
    setWorkoutAdded,
  } = useApp();
  const trainingDays = profile?.trainingDays;
  const today = new Date();
  const todayKey = dateKey(today);
  // A "?date=YYYY-MM-DD" query (e.g. from the dashboard's Upcoming strip)
  // opens the calendar with that day selected and its month in view.
  const [params] = useSearchParams();
  const rawParam = params.get("date") || "";
  const paramDate = /^\d{4}-\d{2}-\d{2}$/.test(rawParam) ? rawParam : null;
  const [cursor, setCursor] = useState(() => {
    if (paramDate) {
      const [y, m] = paramDate.split("-").map(Number);
      return { y, m: m - 1 };
    }
    return { y: today.getFullYear(), m: today.getMonth() };
  });
  const [selected, setSelected] = useState(paramDate || todayKey);

  const firstDow = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();

  // Leading blanks + the actual days of the month.
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Count training days from today through the end of the displayed month, so
  // the header can summarise what's still ahead this month.
  let upcomingCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dObj = new Date(cursor.y, cursor.m, d);
    const k = dateKey(dObj);
    if (k >= todayKey && effectiveWorkoutForDate(workoutPlan, dObj, trainingDays, calendar[k]))
      upcomingCount++;
  }

  const prevMonth = () =>
    setCursor(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }));
  const nextMonth = () =>
    setCursor(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }));
  const goToday = () => {
    setCursor({ y: today.getFullYear(), m: today.getMonth() });
    setSelected(todayKey);
  };

  const entry = history[selected];
  const calEntry = calendar[selected];
  const activities = calEntry?.activities || [];
  const hideWorkout = !!calEntry?.hideWorkout;
  const [sy, sm, sd] = selected.split("-").map(Number);
  const selectedDate = new Date(sy, sm - 1, sd);
  // The plan's scheduled workout for this date, and the effective one after any
  // user removal.
  const scheduledRaw = workoutForDate(workoutPlan, selectedDate, trainingDays);
  const scheduledDay = hideWorkout ? null : scheduledRaw;
  const scheduledIdx = scheduledDay ? workoutPlan.days.indexOf(scheduledDay) : -1;
  // A plan session the user placed on this (otherwise rest) day.
  const addedIdx = !scheduledRaw && Number.isInteger(calEntry?.addWorkoutIdx)
    ? calEntry.addWorkoutIdx
    : null;
  const addedDay = addedIdx !== null ? workoutPlan?.days?.[addedIdx] || null : null;
  const isUpcoming = selected >= todayKey;
  // Sets actually recorded on the selected date, shown as their own card.
  const selectedLog = workoutLog[selected];
  const hasLog = selectedLog && Object.keys(selectedLog).length > 0;

  return (
    <>
      <div className="page-head">
        <h1>Calendar</h1>
        <p>
          {workoutPlan
            ? `Your training schedule for the month. ${upcomingCount} workout${upcomingCount === 1 ? "" : "s"} still ahead this month.`
            : "Browse the workout and meal plans you were using on any day."}
        </p>
      </div>

      {!workoutPlan && (
        <div className="banner">
          Generate a <Link to="/workout">workout plan</Link> to see your upcoming sessions mapped
          across the month.
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="cal-toolbar">
          <button className="btn ghost sm" onClick={prevMonth}>
            ‹
          </button>
          <div className="cal-month">
            {MONTHS[cursor.m]} {cursor.y}
          </div>
          <button className="btn ghost sm" onClick={nextMonth}>
            ›
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={goToday}>
            Today
          </button>
        </div>

        <div className="cal-grid cal-head-row">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday">
              {w}
            </div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (d === null) return <div key={`b${i}`} className="cal-cell empty" />;
            const dObj = new Date(cursor.y, cursor.m, d);
            const key = dateKey(dObj);
            const e = history[key];
            const cal = calendar[key];
            const acts = cal?.activities || [];
            const actTypes = [...new Set(acts.map((a) => a.type))];
            const sched = effectiveWorkoutForDate(workoutPlan, dObj, trainingDays, cal);
            const isToday = key === todayKey;
            const isSel = key === selected;
            const isPast = key < todayKey;
            const isFuture = key > todayKey;
            const logged = Object.keys(workoutLog[key] || {}).length > 0;
            const has = (e && (e.workout || e.diet)) || sched || acts.length > 0 || logged;
            return (
              <button
                key={key}
                className={`cal-cell${has ? " has" : ""}${sched ? " workout" : ""}${isToday ? " today" : ""}${isSel ? " sel" : ""}${isPast ? " past" : ""}`}
                onClick={() => setSelected(key)}
              >
                <span className="cal-num">{d}</span>
                {sched && (
                  <span className="cal-workout" title={sched.day}>
                    {isFuture && <span className="cal-upcoming">Upcoming</span>}
                    {sched.focus || sched.day}
                  </span>
                )}
                {/* Added activities (cardio, flexibility, …) listed by type below
                    the primary workout. */}
                {actTypes.map((t) => (
                  <span
                    key={t}
                    className="cal-activity"
                    style={{ color: activityType(t).color }}
                    title={activityType(t).label}
                  >
                    {activityType(t).label}
                  </span>
                ))}
                {(e?.diet || logged || (sched && e?.workout)) && (
                  <span className="cal-dots">
                    {logged && <span className="cal-dot lg" title="Sets logged" />}
                    {sched && e?.workout && <span className="cal-dot wk" title="Logged workout plan" />}
                    {e?.diet && <span className="cal-dot dt" title="Meal plan" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="page-head" style={{ marginTop: 8 }}>
        <h2 style={{ margin: 0 }}>{prettyDate(selected)}</h2>
        <p>
          {scheduledDay || addedDay
            ? "Training day"
            : hasLog
              ? "Workout logged"
              : activities.length
                ? "Activity day"
                : "Rest day — no workout scheduled"}
        </p>
      </div>

      {scheduledDay && (
        <ScheduledDayView
          day={scheduledDay}
          dayIndex={scheduledIdx}
          upcoming={isUpcoming}
          logDate={selected}
          canLog={selected <= todayKey}
          onRemove={() => setWorkoutHidden(selected, true)}
        />
      )}
      {/* A session the user added onto this rest day. */}
      {!scheduledDay && addedDay && (
        <ScheduledDayView
          day={addedDay}
          dayIndex={addedIdx}
          upcoming={isUpcoming}
          added
          logDate={selected}
          canLog={selected <= todayKey}
          onRemove={() => setWorkoutAdded(selected, null)}
        />
      )}
      {/* Rest day with a plan available — offer to place a session here. */}
      {!scheduledRaw && !addedDay && workoutPlan?.days?.length > 0 && (
        <AddWorkoutCard plan={workoutPlan} onAdd={(idx) => setWorkoutAdded(selected, idx)} />
      )}
      {/* What was actually logged that day — viewable straight from the calendar. */}
      {hasLog && <LoggedWorkoutCard date={selected} dayLog={selectedLog} />}
      {/* The scheduled workout was removed for this day — offer to restore it. */}
      {!scheduledDay && hideWorkout && scheduledRaw && (
        <RemovedWorkoutNote
          day={scheduledRaw}
          onRestore={() => setWorkoutHidden(selected, false)}
        />
      )}
      {/* Archived full-week plan, only on non-training days that have history. */}
      {!scheduledDay && !hideWorkout && entry?.workout && <WorkoutView plan={entry.workout} />}
      {entry?.diet && <DietView plan={entry.diet} />}

      {/* User-added activities (a run, mobility work, etc.) — available any day. */}
      <ActivitiesCard
        date={selected}
        activities={activities}
        onAdd={addActivity}
        onRemove={removeActivity}
      />
    </>
  );
}
