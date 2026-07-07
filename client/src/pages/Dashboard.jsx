import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp, dateKey } from "../context/AppContext.jsx";
import { normalizeExercise } from "../lib/workoutLog.js";
import { STAT_ICONS } from "../components/NavIcons.jsx";
import ExerciseHistory from "../components/ExerciseHistory.jsx";
import {
  nutritionTargets,
  todayActivity,
  readinessBand,
  vo2max,
  vo2maxRating,
  hrvBand,
  effectiveWorkoutForDate,
  activityType,
  goalLabel,
  weeklyExtras,
  EXTRA_META,
} from "../lib/calc.js";

// The dashboard's "Upcoming" strip: the next 7 days at a glance, each tile
// linking to that day on the calendar. Shows the scheduled workout (after any
// per-day calendar overrides), user-added activities, and the weekly
// schedule's cardio/flexibility/recovery sessions; empty days read as rest.
function UpcomingStrip({ workoutPlan, trainingDays, calendar, profile }) {
  const extras = weeklyExtras(profile, workoutPlan, trainingDays);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const key = dateKey(date);
    const workout = effectiveWorkoutForDate(workoutPlan, date, trainingDays, calendar[key]);
    const activities = calendar[key]?.activities || [];
    const ex = extras[date.getDay()];
    days.push({
      key,
      date,
      workout,
      activities,
      // Show the scheduled extra unless the user filled the day themselves
      // (their own activities win, and a workout hides everything except a
      // rides-along flexibility session).
      extra: ex && activities.length === 0 && (ex.withWorkout || !workout) ? ex : null,
    });
  }
  const dow = (date, i) =>
    i === 0
      ? "Today"
      : i === 1
        ? "Tomorrow"
        : date.toLocaleDateString(undefined, { weekday: "short" });

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title-row">
        <h3>Upcoming</h3>
        <Link to="/calendar" className="activity-link">
          Full calendar →
        </Link>
      </div>
      <div className="up-strip">
        {days.map(({ key, date, workout, activities, extra }, i) => (
          <Link
            key={key}
            to={`/calendar?date=${key}`}
            className={`up-day${i === 0 ? " today" : ""}`}
          >
            <span className="up-dow">{dow(date, i)}</span>
            <span className="up-date">
              {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            {workout && (
              <span className="up-item workout" title={workout.day}>
                {workout.focus || workout.day}
                {workout.duration_min ? ` · ${workout.duration_min} min` : ""}
              </span>
            )}
            {activities.map((a) => (
              <span
                key={a.id}
                className="up-item"
                style={{ color: activityType(a.type).color }}
                title={a.title || activityType(a.type).label}
              >
                {activityType(a.type).label}
              </span>
            ))}
            {extra && extra.type !== "recovery" && (
              <span
                className="up-item"
                style={{ color: EXTRA_META[extra.type].color }}
                title={extra.title}
              >
                {EXTRA_META[extra.type].label}
                {extra.duration_min ? ` · ${extra.duration_min} min` : ""}
              </span>
            )}
            {!workout && activities.length === 0 && (!extra || extra.type === "recovery") && (
              <span className="up-rest">Rest &amp; recovery</span>
            )}
          </Link>
        ))}
      </div>
      {!workoutPlan && (
        <p className="muted" style={{ fontSize: 13.5, margin: "12px 0 0" }}>
          <Link to="/workout">Generate a workout plan</Link> to see your training sessions mapped
          across the week.
        </p>
      )}
    </div>
  );
}

function Ring({ value, max = 100, size = 132, label, sub, color = "var(--accent)" }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-2)"
          strokeWidth="11"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>{value}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, tint, label, value, unit, sub }) {
  return (
    <div className="card stat">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="label">{label}</span>
        <span className={`icon ${tint}`}>{STAT_ICONS[icon]}</span>
      </div>
      <div className="value">
        {value}
        {unit && <small> {unit}</small>}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// StatCard's `icon` is a key into STAT_ICONS so the badges match the sidebar's
// line-icon system instead of using emoji.

const BAND_COLOR = {
  peak: "var(--accent)",
  ready: "var(--accent-2)",
  moderate: "var(--warn)",
  low: "var(--danger)",
};

export default function Dashboard() {
  const {
    profile,
    recovery,
    readiness,
    log,
    workoutPlan,
    activity,
    workoutLog,
    calendar,
    sessionCompleted,
  } = useApp();
  const act = todayActivity(profile, log, activity);
  // Exercise whose cross-session history modal is open (null = closed), plus
  // the set of names that have any logged sets at all — only those get a
  // History button.
  const [hxExercise, setHxExercise] = useState(null);
  const loggedNames = new Set(
    Object.values(workoutLog).flatMap((d) => Object.keys(d).map(normalizeExercise))
  );
  // Label real device data vs the built-in estimate, so testers know which is which.
  const sourceLabel = act.source
    ? `From ${act.source === "fitbit" ? "Fitbit" : act.source}`
    : "Estimated — connect a tracker";
  // Today's training day (if any) — including calendar overrides (a session the
  // user added to or removed from today) — and its index in the plan, so we can
  // deep-link straight to its logging page.
  const todayWorkout = effectiveWorkoutForDate(
    workoutPlan,
    new Date(),
    profile?.trainingDays,
    calendar[dateKey()]
  );
  const todayIdx = todayWorkout ? workoutPlan.days.indexOf(todayWorkout) : -1;
  const t = nutritionTargets(profile);
  const band = readinessBand(readiness);
  const stepPct = Math.round((act.steps / act.stepGoal) * 100);
  const vo2 = vo2max(profile, recovery);
  const hrv = recovery.hrv;

  return (
    <>
      <div className="page-head">
        <h1>Welcome back{profile.name ? `, ${profile.name}` : ""} 👋</h1>
        <p>Here's your fitness snapshot for today.</p>
      </div>

      {!profile.onboarded && (
        <div className="banner">
          Finish setting up your profile so the AI can personalise your plans.{" "}
          <Link to="/profile">Complete profile →</Link>
        </div>
      )}

      <UpcomingStrip
        workoutPlan={workoutPlan}
        trainingDays={profile?.trainingDays}
        calendar={calendar}
        profile={profile}
      />

      <div className="grid cols-4">
        <StatCard
          icon="flame"
          tint="tint-amber"
          label="Calories burned"
          value={act.caloriesBurned.toLocaleString()}
          unit="kcal"
          sub={sourceLabel}
        />
        <StatCard
          icon="footprints"
          tint="tint-cyan"
          label="Steps"
          value={act.steps.toLocaleString()}
          sub={`${stepPct}% of ${act.stepGoal.toLocaleString()} goal · ${sourceLabel}`}
        />
        <StatCard
          icon="check"
          tint="tint-green"
          label="Activities"
          value={act.activitiesCompleted}
          sub={`${act.activeMinutes} active minutes`}
        />
        <StatCard
          icon="zap"
          tint="tint-violet"
          label="Readiness"
          value={readiness}
          unit="/100"
          sub={band.toUpperCase()}
        />
      </div>

      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <StatCard
          icon="activity"
          tint="tint-green"
          label="HRV"
          value={hrv}
          unit="ms"
          sub={hrvBand(hrv).toUpperCase()}
        />
        <StatCard
          icon="gauge"
          tint="tint-cyan"
          label="VO₂ max"
          value={vo2}
          unit="ml/kg/min"
          sub={vo2maxRating(vo2).toUpperCase()}
        />
        <StatCard
          icon="heart"
          tint="tint-amber"
          label="Resting HR"
          value={recovery.restingHr}
          unit="bpm"
          sub="At rest"
        />
        <StatCard
          icon="moon"
          tint="tint-violet"
          label="Sleep"
          value={recovery.sleepHours}
          unit="h"
          sub="Last night"
        />
      </div>

      <div className="grid cols-3" style={{ marginTop: 18 }}>
        <div className="card" style={{ display: "grid", placeItems: "center", gap: 14 }}>
          <h3 style={{ alignSelf: "flex-start" }}>Recovery / Readiness</h3>
          <Ring
            value={readiness}
            label="readiness"
            sub={band.toUpperCase()}
            color={BAND_COLOR[band]}
          />
          <p className="muted" style={{ fontSize: 13, textAlign: "center", margin: 0 }}>
            {band === "low" && "Your body needs recovery — go easy today."}
            {band === "moderate" && "Train at a controlled effort today."}
            {band === "ready" && "You're recovered — a solid session is good to go."}
            {band === "peak" && "Peak recovery — push hard today!"}
          </p>
        </div>

        <div className="card" style={{ display: "grid", placeItems: "center", gap: 14 }}>
          <h3 style={{ alignSelf: "flex-start" }}>Daily Steps</h3>
          <Ring value={act.steps} max={act.stepGoal} label="steps" color="var(--accent-2)" />
          <p className="muted" style={{ fontSize: 13, textAlign: "center", margin: 0 }}>
            {stepPct >= 100
              ? "Goal smashed! 🎉"
              : `${(act.stepGoal - act.steps).toLocaleString()} steps to your goal`}
          </p>
        </div>

        <div className="card">
          <div className="card-title-row">
            <h3>Nutrition Targets</h3>
            <span className="engine-tag" title={goalLabel(profile)}>
              {/* Custom goals can be long — keep the little tag readable. */}
              {goalLabel(profile).length > 30
                ? `${goalLabel(profile).slice(0, 30)}…`
                : goalLabel(profile)}
            </span>
          </div>
          <div className="stat" style={{ marginBottom: 16 }}>
            <span className="label">Daily calorie target</span>
            <div className="value">
              {t.calories.toLocaleString()}
              <small> kcal</small>
            </div>
            <div className="sub">Maintenance ≈ {t.maintenance.toLocaleString()} kcal</div>
          </div>
          {[
            { m: "Protein", v: t.proteinG, color: "var(--accent)" },
            { m: "Carbs", v: t.carbsG, color: "var(--accent-2)" },
            { m: "Fat", v: t.fatG, color: "var(--accent-3)" },
          ].map((row) => {
            const totalG = t.proteinG + t.carbsG + t.fatG;
            return (
              <div key={row.m} style={{ marginBottom: 12 }}>
                <div className="macro-row">
                  <span className="m">{row.m}</span>
                  <span>{row.v} g</span>
                </div>
                <div className="bar">
                  <span style={{ width: `${(row.v / totalG) * 100}%`, background: row.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-title-row">
            <h3>Today's Training</h3>
          </div>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            Your AI workout plan adapts to today's readiness score of{" "}
            <b style={{ color: BAND_COLOR[band] }}>{readiness}/100</b>.
            {band === "low"
              ? " It will automatically deload to protect recovery."
              : " You're cleared for a productive session."}
          </p>
          {todayWorkout?.exercises?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {todayWorkout.exercises.map((ex, j) => (
                <div key={j} className="hx-ex" style={{ padding: "8px 0" }}>
                  <div
                    className="row"
                    style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
                  >
                    <span className="ex-name">{ex.name}</span>
                    <span className="row" style={{ gap: 10, alignItems: "baseline" }}>
                      <span className="ex-scheme">
                        {ex.sets} × {ex.reps}
                      </span>
                      {loggedNames.has(normalizeExercise(ex.name)) && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          style={{ padding: "3px 9px", fontSize: 12 }}
                          onClick={() => setHxExercise(ex.name)}
                        >
                          📈 History
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <Link to="/workout">
              <button className="btn">View workout plan →</button>
            </Link>
            {todayIdx >= 0 &&
              (sessionCompleted(todayIdx) ? (
                <Link to={`/workout/log/${todayIdx}`}>
                  <button className="btn ghost done">✓ View today's workout</button>
                </Link>
              ) : (
                <Link to={`/workout/log/${todayIdx}`}>
                  <button className="btn ghost">✎ Log today's workout</button>
                </Link>
              ))}
          </div>
          {hxExercise && (
            <ExerciseHistory
              exercise={hxExercise}
              baselineDay={dateKey()}
              onClose={() => setHxExercise(null)}
            />
          )}
        </div>
        <div className="card">
          <div className="card-title-row">
            <h3>Nutrition Plan</h3>
          </div>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
            A full AI-built meal plan tuned to your {t.calories.toLocaleString()} kcal target and{" "}
            {t.proteinG}g protein goal is ready.
          </p>
          <Link to="/diet">
            <button className="btn" style={{ marginTop: 8 }}>
              View diet plan →
            </button>
          </Link>
        </div>
      </div>
    </>
  );
}
