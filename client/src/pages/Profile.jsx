import { useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import PrivacySecurity from "../components/PrivacySecurity.jsx";
import ConnectedDevices from "../components/ConnectedDevices.jsx";
import {
  GOALS,
  ACTIVITY_LEVELS,
  nutritionTargets,
  readinessBand,
  defaultTrainingDays,
} from "../lib/calc.js";

// Weekday toggle order (Monday-first) with JS weekday numbers.
const WEEK = [
  { n: 1, l: "Mon" },
  { n: 2, l: "Tue" },
  { n: 3, l: "Wed" },
  { n: 4, l: "Thu" },
  { n: 5, l: "Fri" },
  { n: 6, l: "Sat" },
  { n: 0, l: "Sun" },
];

export default function Profile() {
  const { profile, updateProfile, recovery, updateRecovery, readiness } = useApp();
  const [impInput, setImpInput] = useState("");
  const [saved, setSaved] = useState(false);
  const t = nutritionTargets(profile);

  function addImpairment(e) {
    e.preventDefault();
    const v = impInput.trim();
    if (v && !(profile.impairments || []).includes(v)) {
      updateProfile({ impairments: [...(profile.impairments || []), v] });
    }
    setImpInput("");
  }
  function removeImpairment(v) {
    updateProfile({ impairments: profile.impairments.filter((x) => x !== v) });
  }
  function flash() {
    updateProfile({ onboarded: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const num = (v) => (v === "" ? "" : Number(v));

  // Selected training weekdays — fall back to the default spread for the user's
  // days/week until they customise it.
  const trainingDays = profile.trainingDays ?? defaultTrainingDays(profile.daysPerWeek);
  const toggleDay = (n) => {
    const set = new Set(trainingDays);
    if (set.has(n)) set.delete(n);
    else set.add(n);
    updateProfile({ trainingDays: WEEK.map((w) => w.n).filter((d) => set.has(d)) });
  };

  return (
    <>
      <div className="page-head">
        <h1>{profile.onboarded ? "Profile & Recovery" : "Let's set up your profile"}</h1>
        <p>The AI uses everything here to personalise your plans. Changes save automatically.</p>
      </div>

      {!profile.onboarded && (
        <div className="banner">
          👋 <b>Welcome to FitAI!</b> Tell us about yourself — your name, age, body stats and
          goals — then hit <b>Save profile</b> at the bottom. The AI uses these details to build
          your workout and diet plans.
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title-row">
            <h3>About You</h3>
          </div>
          <div className="field">
            <label>Name</label>
            <input
              value={profile.name}
              onChange={(e) => updateProfile({ name: e.target.value })}
              placeholder="Your name"
            />
          </div>
          <div className="grid cols-2" style={{ gap: 14 }}>
            <div className="field">
              <label>Age</label>
              <input
                type="number"
                value={profile.age}
                onChange={(e) => updateProfile({ age: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Sex</label>
              <select value={profile.sex} onChange={(e) => updateProfile({ sex: e.target.value })}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="field">
              <label>Height (cm)</label>
              <input
                type="number"
                value={profile.heightCm}
                onChange={(e) => updateProfile({ heightCm: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Weight (kg)</label>
              <input
                type="number"
                value={profile.weightKg}
                onChange={(e) => updateProfile({ weightKg: num(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title-row">
            <h3>Goals & Training</h3>
          </div>
          <div className="field">
            <label>Primary goal</label>
            <select value={profile.goal} onChange={(e) => updateProfile({ goal: e.target.value })}>
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Activity level</label>
            <select
              value={profile.activityLevel}
              onChange={(e) => updateProfile({ activityLevel: e.target.value })}
            >
              {ACTIVITY_LEVELS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid cols-2" style={{ gap: 14 }}>
            <div className="field">
              <label>
                Training days / week: <span className="range-val">{profile.daysPerWeek}</span>
              </label>
              <input
                type="range"
                min="2"
                max="6"
                value={profile.daysPerWeek}
                onChange={(e) => updateProfile({ daysPerWeek: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Experience</label>
              <select
                value={profile.experience}
                onChange={(e) => updateProfile({ experience: e.target.value })}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Which days do you train?</label>
            <div className="weekday-picker">
              {WEEK.map((w) => (
                <button
                  key={w.n}
                  type="button"
                  className={`wd-btn${trainingDays.includes(w.n) ? " on" : ""}`}
                  onClick={() => toggleDay(w.n)}
                  aria-pressed={trainingDays.includes(w.n)}
                >
                  {w.l}
                </button>
              ))}
            </div>
            <span className="muted" style={{ fontSize: 12.5, marginTop: 8, display: "block" }}>
              {trainingDays.length === 0
                ? "Pick the weekdays you train — your Calendar maps your plan onto them."
                : trainingDays.length === profile.daysPerWeek
                  ? "Your Calendar maps your plan onto these days."
                  : `You've picked ${trainingDays.length} day${trainingDays.length === 1 ? "" : "s"}, but your plan is ${profile.daysPerWeek} days/week — pick ${profile.daysPerWeek} to match.`}
            </span>
          </div>
        </div>

        <div className="card">
          <div className="card-title-row">
            <h3>Impairments & Injuries</h3>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
            List anything the AI should train around (e.g. "left knee pain", "lower back disc",
            "rotator cuff"). It will substitute risky movements.
          </p>
          <form onSubmit={addImpairment} className="row">
            <input
              style={{
                flex: 1,
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                borderRadius: 10,
                padding: "11px 13px",
                fontSize: 14,
              }}
              value={impInput}
              onChange={(e) => setImpInput(e.target.value)}
              placeholder="Add an impairment and press Enter"
            />
            <button className="btn ghost sm" type="submit">
              Add
            </button>
          </form>
          <div className="tag-input-tags">
            {(profile.impairments || []).length === 0 && (
              <span className="muted" style={{ fontSize: 13 }}>
                None added.
              </span>
            )}
            {(profile.impairments || []).map((v) => (
              <span key={v} className="tag">
                {v}
                <button onClick={() => removeImpairment(v)}>×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title-row">
            <h3>Recovery (today)</h3>
            <span className="engine-tag">
              Readiness {readiness}/100 · {readinessBand(readiness)}
            </span>
          </div>
          <div className="field">
            <label>
              Sleep last night: <span className="range-val">{recovery.sleepHours} h</span>
            </label>
            <input
              type="range"
              min="3"
              max="10"
              step="0.5"
              value={recovery.sleepHours}
              onChange={(e) => updateRecovery({ sleepHours: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>
              Resting heart rate: <span className="range-val">{recovery.restingHr} bpm</span>
            </label>
            <input
              type="range"
              min="40"
              max="90"
              value={recovery.restingHr}
              onChange={(e) => updateRecovery({ restingHr: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>
              HRV (heart-rate variability): <span className="range-val">{recovery.hrv} ms</span>
            </label>
            <input
              type="range"
              min="20"
              max="120"
              value={recovery.hrv}
              onChange={(e) => updateRecovery({ hrv: num(e.target.value) })}
            />
          </div>
          <div className="grid cols-2" style={{ gap: 14 }}>
            <div className="field">
              <label>
                Muscle soreness: <span className="range-val">{recovery.soreness}/5</span>
              </label>
              <input
                type="range"
                min="1"
                max="5"
                value={recovery.soreness}
                onChange={(e) => updateRecovery({ soreness: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>
                Stress level: <span className="range-val">{recovery.stress}/5</span>
              </label>
              <input
                type="range"
                min="1"
                max="5"
                value={recovery.stress}
                onChange={(e) => updateRecovery({ stress: num(e.target.value) })}
              />
            </div>
          </div>
          <div className="field">
            <label>
              Hours since last workout:{" "}
              <span className="range-val">{recovery.hoursSinceWorkout} h</span>
            </label>
            <input
              type="range"
              min="0"
              max="72"
              value={recovery.hoursSinceWorkout}
              onChange={(e) => updateRecovery({ hoursSinceWorkout: num(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-title-row">
          <h3>Your Computed Targets</h3>
        </div>
        <div className="row" style={{ gap: 28 }}>
          <div className="stat">
            <span className="label">Maintenance</span>
            <div className="value">
              {t.maintenance.toLocaleString()}
              <small> kcal</small>
            </div>
          </div>
          <div className="stat">
            <span className="label">Goal calories</span>
            <div className="value" style={{ color: "var(--accent)" }}>
              {t.calories.toLocaleString()}
              <small> kcal</small>
            </div>
          </div>
          <div className="stat">
            <span className="label">Protein</span>
            <div className="value">
              {t.proteinG}
              <small> g</small>
            </div>
          </div>
          <div className="stat">
            <span className="label">Carbs</span>
            <div className="value">
              {t.carbsG}
              <small> g</small>
            </div>
          </div>
          <div className="stat">
            <span className="label">Fat</span>
            <div className="value">
              {t.fatG}
              <small> g</small>
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn" onClick={flash}>
            {saved ? "✓ Saved" : "Save profile"}
          </button>
          <span className="muted" style={{ fontSize: 13 }}>
            Your data is saved to your account.
          </span>
        </div>
      </div>

      <ConnectedDevices />

      <PrivacySecurity />
    </>
  );
}
