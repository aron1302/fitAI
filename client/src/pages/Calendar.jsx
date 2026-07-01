import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp, dateKey } from "../context/AppContext.jsx";
import { engineLabel, workoutForDate } from "../lib/calc.js";

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
function ScheduledDayView({ day, dayIndex, upcoming, logDate, canLog, onRemove }) {
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title-row">
        <h3>
          🏋 {day.focus || day.day}
          {day.day && day.focus && day.day !== day.focus ? ` — ${day.day}` : ""}
        </h3>
        <span className={`pill ${day.intensity || "moderate"}`}>
          {upcoming ? "Upcoming" : "Scheduled"}
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

// User-addable activity types (a run, mobility work, etc.) with a colour used
// for the calendar dot and the activity pill.
const ACTIVITY_TYPES = [
  { value: "cardio", label: "Cardio / Run", color: "var(--accent-2)" },
  { value: "flexibility", label: "Flexibility", color: "var(--accent-3)" },
  { value: "mobility", label: "Mobility", color: "var(--accent)" },
  { value: "sport", label: "Sport", color: "var(--warn)" },
  { value: "other", label: "Other", color: "var(--muted)" },
];
const activityType = (v) =>
  ACTIVITY_TYPES.find((t) => t.value === v) || ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];

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
  const { history, workoutPlan, profile, calendar, addActivity, removeActivity, setWorkoutHidden } =
    useApp();
  const trainingDays = profile?.trainingDays;
  const today = new Date();
  const todayKey = dateKey(today);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(todayKey);

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
    if (k >= todayKey && !calendar[k]?.hideWorkout && workoutForDate(workoutPlan, dObj, trainingDays))
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
  const isUpcoming = selected >= todayKey;

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
            const sched = cal?.hideWorkout ? null : workoutForDate(workoutPlan, dObj, trainingDays);
            const isToday = key === todayKey;
            const isSel = key === selected;
            const isPast = key < todayKey;
            const isFuture = key > todayKey;
            const has = (e && (e.workout || e.diet)) || sched || acts.length > 0;
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
                {(e?.diet || (sched && e?.workout)) && (
                  <span className="cal-dots">
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
          {scheduledDay
            ? "Training day"
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
