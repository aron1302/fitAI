import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext.jsx";
import { readinessBand, engineLabel } from "../lib/calc.js";
import SuggestEdit from "../components/SuggestEdit.jsx";
import ExerciseDemo from "../components/ExerciseDemo.jsx";

export default function Workout() {
  const {
    profile,
    recovery,
    readiness,
    workoutPlan: plan,
    setWorkoutPlan: setPlan,
    recoveryPlan,
    setRecoveryPlan,
    genState,
    generateWorkout,
    generateRecovery,
  } = useApp();
  // Generation status comes from context so the spinner/errors survive the user
  // navigating away mid-generate and coming back.
  const { loading, error } = genState.workout;
  const { loading: recLoading, error: recError } = genState.recovery;
  const [draft, setDraft] = useState(null); // non-null while editing
  const band = readinessBand(readiness);

  // ---- editing helpers (operate on a draft copy) ----
  const startEdit = () => setDraft(structuredClone(plan));
  const cancelEdit = () => setDraft(null);
  const saveEdit = () => {
    setPlan({ ...draft, _edited: true });
    setDraft(null);
  };
  const patchDraft = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const patchDay = (di, patch) =>
    setDraft((d) => ({
      ...d,
      days: d.days.map((day, i) => (i === di ? { ...day, ...patch } : day)),
    }));
  const patchEx = (di, ei, patch) =>
    patchDayEx(di, (exs) => exs.map((ex, i) => (i === ei ? { ...ex, ...patch } : ex)));
  const patchDayEx = (di, fn) =>
    setDraft((d) => ({
      ...d,
      days: d.days.map((day, i) => (i === di ? { ...day, exercises: fn(day.exercises) } : day)),
    }));
  const addEx = (di) =>
    patchDayEx(di, (exs) => [...exs, { name: "New exercise", sets: 3, reps: "8-12", notes: "" }]);
  const removeEx = (di, ei) => patchDayEx(di, (exs) => exs.filter((_, i) => i !== ei));
  const addDay = () =>
    setDraft((d) => ({
      ...d,
      days: [
        ...d.days,
        { day: "New Day", focus: "", intensity: "moderate", duration_min: 45, exercises: [] },
      ],
    }));
  const removeDay = (di) => setDraft((d) => ({ ...d, days: d.days.filter((_, i) => i !== di) }));

  const editing = draft !== null;
  const view = editing ? draft : plan;

  return (
    <>
      <div className="page-head">
        <h1>AI Workout Plan</h1>
        <p>
          Built around your goal, age, weight, and today's readiness ({readiness}/100 · {band}).
        </p>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {profile.goal.replace("_", " ")} · {profile.daysPerWeek} days/week ·{" "}
              {profile.experience}
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
              {profile.impairments?.length
                ? `Adjusting for: ${profile.impairments.join(", ")}`
                : "No impairments on file"}
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            {plan && !editing && (
              <button className="btn ghost" onClick={startEdit}>
                ✎ Edit
              </button>
            )}
            <button className="btn" onClick={generateWorkout} disabled={loading || editing}>
              {loading ? (
                <>
                  <span className="spinner" /> Generating…
                </>
              ) : plan ? (
                "Regenerate"
              ) : (
                "Generate plan"
              )}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="banner">⚠ {error}. Make sure the server is running.</div>}

      {!plan && !loading && (
        <div className="card empty">
          <div style={{ fontSize: 40, marginBottom: 10 }}>🏋️</div>
          <p>
            Click <b>Generate plan</b> to have the AI design this week's training, scaled to how
            recovered you are today.
          </p>
        </div>
      )}

      {loading && !plan && (
        <div className="card empty">
          <span className="spinner dark" style={{ width: 28, height: 28 }} />
          <p style={{ marginTop: 14 }}>The AI coach is designing your program…</p>
        </div>
      )}

      {editing && (
        <div className="edit-bar">
          <span style={{ fontWeight: 700 }}>✎ Editing plan</span>
          <span className="muted" style={{ fontSize: 13 }}>
            Make your changes, then save.
          </span>
          <button className="btn ghost sm" onClick={cancelEdit}>
            Cancel
          </button>
          <button className="btn sm" onClick={saveEdit}>
            Save changes
          </button>
        </div>
      )}

      {view && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-title-row">
              <h3>This Week</h3>
              <span className="engine-tag">
                {view._edited ? "✎ Edited by you" : engineLabel(view._engine)}
              </span>
            </div>
            {editing ? (
              <textarea
                className="edit-inp"
                rows={2}
                value={view.summary}
                onChange={(e) => patchDraft({ summary: e.target.value })}
              />
            ) : (
              <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 14px" }}>{view.summary}</p>
            )}
            {!editing && (
              <div className="callout">
                <b>Readiness guidance:</b> {view.readiness_guidance}
              </div>
            )}
            {!editing && view.cautions && (
              <div className="callout warn" style={{ marginTop: 12 }}>
                ⚠ {view.cautions}
              </div>
            )}
          </div>

          <div className="grid cols-2">
            {view.days.map((d, i) => (
              <div key={i} className="card day-card">
                {editing ? (
                  <>
                    <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                      <input
                        className="edit-inp"
                        value={d.day}
                        onChange={(e) => patchDay(i, { day: e.target.value })}
                        placeholder="Day (e.g. Monday)"
                      />
                      <input
                        className="edit-inp"
                        value={d.focus || ""}
                        onChange={(e) => patchDay(i, { focus: e.target.value })}
                        placeholder="Focus (e.g. Push)"
                      />
                      <button className="icon-btn" title="Remove day" onClick={() => removeDay(i)}>
                        ×
                      </button>
                    </div>
                    <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                      <select
                        className="edit-inp sm"
                        value={d.intensity}
                        onChange={(e) => patchDay(i, { intensity: e.target.value })}
                      >
                        <option value="low">low</option>
                        <option value="moderate">moderate</option>
                        <option value="high">high</option>
                      </select>
                      <input
                        className="edit-inp sm"
                        type="number"
                        value={d.duration_min}
                        onChange={(e) => patchDay(i, { duration_min: Number(e.target.value) })}
                        title="Minutes"
                      />
                    </div>
                    {d.exercises.map((ex, j) => (
                      <div key={j} className="ex-edit">
                        <input
                          className="edit-inp sm"
                          value={ex.name}
                          onChange={(e) => patchEx(i, j, { name: e.target.value })}
                          placeholder="Exercise"
                        />
                        <input
                          className="edit-inp sm"
                          type="number"
                          value={ex.sets}
                          onChange={(e) => patchEx(i, j, { sets: Number(e.target.value) })}
                          title="Sets"
                        />
                        <input
                          className="edit-inp sm"
                          value={ex.reps}
                          onChange={(e) => patchEx(i, j, { reps: e.target.value })}
                          title="Reps"
                        />
                        <button
                          className="icon-btn"
                          title="Remove exercise"
                          onClick={() => removeEx(i, j)}
                        >
                          ×
                        </button>
                        <input
                          className="edit-inp sm ex-notes-edit"
                          value={ex.notes || ""}
                          onChange={(e) => patchEx(i, j, { notes: e.target.value })}
                          placeholder="Notes (optional)"
                        />
                      </div>
                    ))}
                    <button className="add-btn" onClick={() => addEx(i)}>
                      + Add exercise
                    </button>
                  </>
                ) : (
                  <>
                    <div className="day-head">
                      <span className="day-title">
                        <span className="focus">{d.day}</span>
                        {d.focus && d.focus.trim().toLowerCase() !== d.day.trim().toLowerCase() && (
                          <span className="day-focus">{d.focus}</span>
                        )}
                      </span>
                      <div className="row" style={{ gap: 8 }}>
                        <span className={`pill ${d.intensity}`}>
                          {d.intensity} · {d.duration_min} min
                        </span>
                        <Link className="btn ghost sm" to={`/workout/log/${i}`}>
                          Log workout
                        </Link>
                      </div>
                    </div>
                    {d.exercises.map((ex, j) => (
                      <div key={j} className="ex-row">
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
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
          {editing && (
            <button className="add-btn" onClick={addDay}>
              + Add training day
            </button>
          )}
        </>
      )}

      {/* ---------- Recovery Plan ---------- */}
      <div className="page-head" style={{ marginTop: 38 }}>
        <h1>AI Recovery Plan</h1>
        <p>
          Personalised recovery from your readiness ({readiness}/100), HRV ({recovery.hrv} ms), age,
          weight, soreness & stress.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="muted" style={{ fontSize: 13.5 }}>
            HRV <b style={{ color: "var(--text)" }}>{recovery.hrv} ms</b> · resting HR{" "}
            <b style={{ color: "var(--text)" }}>{recovery.restingHr} bpm</b> · sleep{" "}
            <b style={{ color: "var(--text)" }}>{recovery.sleepHours} h</b> · soreness{" "}
            <b style={{ color: "var(--text)" }}>{recovery.soreness}/5</b>
          </div>
          <button className="btn" onClick={generateRecovery} disabled={recLoading}>
            {recLoading ? (
              <>
                <span className="spinner" /> Generating…
              </>
            ) : recoveryPlan ? (
              "Regenerate"
            ) : (
              "Generate recovery plan"
            )}
          </button>
        </div>
      </div>

      {recError && <div className="banner">⚠ {recError}. Make sure the server is running.</div>}

      {!recoveryPlan && !recLoading && (
        <div className="card empty">
          <div style={{ fontSize: 40, marginBottom: 10 }}>🧘</div>
          <p>
            Click <b>Generate recovery plan</b> for AI guidance on rest, sleep, mobility, and when
            to train hard again.
          </p>
        </div>
      )}

      {recLoading && !recoveryPlan && (
        <div className="card empty">
          <span className="spinner dark" style={{ width: 28, height: 28 }} />
          <p style={{ marginTop: 14 }}>The AI is assessing your recovery…</p>
        </div>
      )}

      {recoveryPlan && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-title-row">
              <h3>{recoveryPlan.recovery_status}</h3>
              <span className="engine-tag">{engineLabel(recoveryPlan._engine)}</span>
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 14px" }}>
              {recoveryPlan.summary}
            </p>
            <div className="grid cols-3" style={{ gap: 14 }}>
              <div className="stat">
                <span className="label">Ready to train hard in</span>
                <div className="value">
                  {recoveryPlan.estimated_recovery_hours}
                  <small> h</small>
                </div>
              </div>
              <div className="stat">
                <span className="label">Sleep target tonight</span>
                <div className="value">
                  {recoveryPlan.sleep_target_hours}
                  <small> h</small>
                </div>
              </div>
              <div className="stat">
                <span className="label">Readiness</span>
                <div className="value">
                  {readiness}
                  <small> /100</small>
                </div>
              </div>
            </div>
            {recoveryPlan.focus_areas?.length > 0 && (
              <div className="row" style={{ marginTop: 14, gap: 8 }}>
                {recoveryPlan.focus_areas.map((f, i) => (
                  <span key={i} className="pill moderate">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid cols-2">
            {recoveryPlan.recommendations?.map((rec, i) => (
              <div key={i} className="card">
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>✓ {rec.title}</div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {rec.detail}
                </div>
              </div>
            ))}
          </div>

          {recoveryPlan.hydration_nutrition && (
            <div className="callout" style={{ marginTop: 18 }}>
              💧 {recoveryPlan.hydration_nutrition}
            </div>
          )}

          <SuggestEdit
            kind="recovery"
            plan={recoveryPlan}
            setPlan={setRecoveryPlan}
            placeholder="e.g. I have a 5k race tomorrow, or my knee feels worse than I logged"
          />
        </>
      )}
    </>
  );
}
