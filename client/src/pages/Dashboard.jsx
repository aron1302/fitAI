import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { STAT_ICONS } from "../components/NavIcons.jsx";
import {
  nutritionTargets,
  todayActivity,
  readinessBand,
  vo2max,
  vo2maxRating,
  hrvBand,
  workoutForDate,
} from "../lib/calc.js";

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
  const { profile, recovery, readiness, log, workoutPlan, activity } = useApp();
  const act = todayActivity(profile, log, activity);
  // Label real device data vs the built-in estimate, so testers know which is which.
  const sourceLabel = act.source
    ? `From ${act.source === "fitbit" ? "Fitbit" : act.source}`
    : "Estimated — connect a tracker";
  // Today's scheduled training day (if any) and its index in the plan, so we can
  // deep-link straight to its logging page.
  const todayWorkout = workoutForDate(workoutPlan, new Date(), profile?.trainingDays);
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
            <span className="engine-tag">{profile.goal}</span>
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
          <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <Link to="/workout">
              <button className="btn">View workout plan →</button>
            </Link>
            {todayIdx >= 0 && (
              <Link to={`/workout/log/${todayIdx}`}>
                <button className="btn ghost">✎ Log today's workout</button>
              </Link>
            )}
          </div>
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
