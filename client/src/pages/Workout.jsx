import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp, dateKey } from "../context/AppContext.jsx";
import { readinessBand, engineLabel, effectiveWorkoutForDate, goalLabel } from "../lib/calc.js";
import SuggestEdit from "../components/SuggestEdit.jsx";
import ExerciseDemo from "../components/ExerciseDemo.jsx";

// Tidy user edits before they become the plan. The exercise NAME is what drives
// the demo picture and the set-log bucket, so an exercise left with a blank name
// (or the old "New exercise" default) but text in the notes field almost
// certainly had its name typed into the wrong box — promote the notes to the
// name. Rows left entirely blank are dropped.
function normalizeDays(days) {
  return days.map((day) => ({
    ...day,
    exercises: day.exercises
      .map((ex) => {
        const name = (ex.name || "").trim();
        const notes = (ex.notes || "").trim();
        if ((name === "" || name === "New exercise") && notes)
          return { ...ex, name: notes, notes: "" };
        return { ...ex, name, notes };
      })
      .filter((ex) => ex.name !== ""),
  }));
}

// Read-only card for one training day: day/focus header, intensity pill,
// "Log workout" link, a per-day edit button, and the exercise list with demos.
function DayView({ day, dayIndex, onEditDay }) {
  return (
    <div className="card day-card">
      <div className="day-head">
        <span className="day-title">
          <span className="focus">{day.day}</span>
          {day.focus && day.focus.trim().toLowerCase() !== day.day.trim().toLowerCase() && (
            <span className="day-focus">{day.focus}</span>
          )}
        </span>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className={`pill ${day.intensity}`}>
            {day.intensity} · {day.duration_min} min
          </span>
          {dayIndex >= 0 && (
            <Link className="btn ghost sm" to={`/workout/log/${dayIndex}`}>
              Log workout
            </Link>
          )}
          {onEditDay && (
            <button className="btn ghost sm" onClick={onEditDay} title="Edit this workout">
              ✎ Edit
            </button>
          )}
        </div>
      </div>
      {day.exercises.map((ex, j) => (
        <div key={j} className="ex-row">
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
      ))}
    </div>
  );
}

// Editable card for one training day — used by both whole-plan editing and the
// per-day "✎ Edit". `onRemoveDay` is only offered when editing the whole plan.
function DayEdit({ day, di, patchDay, patchEx, addEx, removeEx, onRemoveDay }) {
  return (
    <div className="card day-card">
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <input
          className="edit-inp"
          value={day.day}
          onChange={(e) => patchDay(di, { day: e.target.value })}
          placeholder="Day (e.g. Monday)"
        />
        <input
          className="edit-inp"
          value={day.focus || ""}
          onChange={(e) => patchDay(di, { focus: e.target.value })}
          placeholder="Focus (e.g. Push)"
        />
        {onRemoveDay && (
          <button className="icon-btn" title="Remove day" onClick={onRemoveDay}>
            ×
          </button>
        )}
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <select
          className="edit-inp sm"
          value={day.intensity}
          onChange={(e) => patchDay(di, { intensity: e.target.value })}
        >
          <option value="low">low</option>
          <option value="moderate">moderate</option>
          <option value="high">high</option>
        </select>
        <input
          className="edit-inp sm"
          type="number"
          value={day.duration_min}
          onChange={(e) => patchDay(di, { duration_min: Number(e.target.value) })}
          title="Minutes"
        />
      </div>
      {day.exercises.map((ex, j) => (
        <div key={j} className="ex-edit">
          <input
            className="edit-inp sm"
            value={ex.name}
            onChange={(e) => patchEx(di, j, { name: e.target.value })}
            placeholder="Exercise name"
          />
          <input
            className="edit-inp sm"
            type="number"
            value={ex.sets}
            onChange={(e) => patchEx(di, j, { sets: Number(e.target.value) })}
            title="Sets"
          />
          <input
            className="edit-inp sm"
            value={ex.reps}
            onChange={(e) => patchEx(di, j, { reps: e.target.value })}
            title="Reps"
          />
          <button className="icon-btn" title="Remove exercise" onClick={() => removeEx(di, j)}>
            ×
          </button>
          <input
            className="edit-inp sm ex-notes-edit"
            value={ex.notes || ""}
            onChange={(e) => patchEx(di, j, { notes: e.target.value })}
            placeholder="Notes (optional)"
          />
        </div>
      ))}
      <button className="add-btn" onClick={() => addEx(di)}>
        + Add exercise
      </button>
    </div>
  );
}

export default function Workout() {
  const {
    profile,
    recovery,
    readiness,
    workoutPlan: plan,
    setWorkoutPlan: setPlan,
    recoveryPlan,
    setRecoveryPlan,
    calendar,
    genState,
    generateWorkout,
    generateRecovery,
  } = useApp();
  // Generation status comes from context so the spinner/errors survive the user
  // navigating away mid-generate and coming back.
  const { loading, error } = genState.workout;
  const { loading: recLoading, error: recError } = genState.recovery;
  const [draft, setDraft] = useState(null); // non-null while editing
  // What the draft covers: "all" (whole-plan edit) or a single day's index.
  const [editScope, setEditScope] = useState("all");
  // false = just today's session (default); true = the full week grid.
  const [week, setWeek] = useState(false);
  const band = readinessBand(readiness);

  // Today's session, honouring the calendar's per-day overrides (a removed
  // scheduled workout or one the user added onto a rest day).
  const todayWorkout = effectiveWorkoutForDate(
    plan,
    new Date(),
    profile?.trainingDays,
    calendar[dateKey()]
  );
  const todayIdx = todayWorkout && plan ? plan.days.indexOf(todayWorkout) : -1;

  // ---- editing helpers (operate on a draft copy) ----
  const startEdit = () => {
    setDraft(structuredClone(plan));
    setEditScope("all");
  };
  const startEditDay = (i) => {
    setDraft(structuredClone(plan));
    setEditScope(i);
  };
  const cancelEdit = () => setDraft(null);
  const saveEdit = () => {
    setPlan({ ...draft, days: normalizeDays(draft.days), _edited: true });
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
    patchDayEx(di, (exs) => [...exs, { name: "", sets: 3, reps: "8-12", notes: "" }]);
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
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
        >
          <div>
            <h1>AI Workout Plan</h1>
            <p>
              Built around your goal, age, weight, and today's readiness ({readiness}/100 · {band}
              ).
            </p>
          </div>
          {plan && !editing && (
            <button className="btn ghost sm" onClick={() => setWeek((w) => !w)}>
              {week ? "Today's workout" : "View full week →"}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {goalLabel(profile)} · {profile.daysPerWeek} days/week · {profile.experience}
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
                ✎ Edit plan
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
          <span style={{ fontWeight: 700 }}>
            ✎ {editScope === "all" ? "Editing plan" : `Editing ${view.days[editScope]?.day || "day"}`}
          </span>
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

      {/* Editing a single day: just that day's card. */}
      {view && editing && editScope !== "all" && view.days[editScope] && (
        <DayEdit
          day={view.days[editScope]}
          di={editScope}
          patchDay={patchDay}
          patchEx={patchEx}
          addEx={addEx}
          removeEx={removeEx}
        />
      )}

      {/* Editing the whole plan: summary + every day + add/remove days. */}
      {view && editing && editScope === "all" && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-title-row">
              <h3>This Week</h3>
              <span className="engine-tag">✎ Editing</span>
            </div>
            <textarea
              className="edit-inp"
              rows={2}
              value={view.summary}
              onChange={(e) => patchDraft({ summary: e.target.value })}
            />
          </div>
          <div className="grid cols-2">
            {view.days.map((d, i) => (
              <DayEdit
                key={i}
                day={d}
                di={i}
                patchDay={patchDay}
                patchEx={patchEx}
                addEx={addEx}
                removeEx={removeEx}
                onRemoveDay={() => removeDay(i)}
              />
            ))}
          </div>
          <button className="add-btn" onClick={addDay}>
            + Add training day
          </button>
        </>
      )}

      {/* Default view: just today's session, front and centre. */}
      {view && !editing && !week && (
        <>
          {todayIdx >= 0 ? (
            <>
              <DayView
                day={view.days[todayIdx]}
                dayIndex={todayIdx}
                onEditDay={() => startEditDay(todayIdx)}
              />
              {view.cautions && (
                <div className="callout warn" style={{ marginTop: 16 }}>
                  ⚠ {view.cautions}
                </div>
              )}
            </>
          ) : (
            <div className="card empty">
              <div style={{ fontSize: 40, marginBottom: 10 }}>😴</div>
              <p>There aren&apos;t any workouts scheduled for today — it&apos;s a rest day.</p>
              <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
                <button className="btn ghost" onClick={() => setWeek(true)}>
                  View full week
                </button>
                <Link className="btn" to="/calendar">
                  Add one from the calendar
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {/* Full-week view: summary, guidance, and every day's card. */}
      {view && !editing && week && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-title-row">
              <h3>This Week</h3>
              <span className="engine-tag">
                {view._edited ? "✎ Edited by you" : engineLabel(view._engine)}
              </span>
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 14px" }}>{view.summary}</p>
            <div className="callout">
              <b>Readiness guidance:</b> {view.readiness_guidance}
            </div>
            {view.cautions && (
              <div className="callout warn" style={{ marginTop: 12 }}>
                ⚠ {view.cautions}
              </div>
            )}
          </div>
          <div className="grid cols-2">
            {view.days.map((d, i) => (
              <DayView key={i} day={d} dayIndex={i} onEditDay={() => startEditDay(i)} />
            ))}
          </div>
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
