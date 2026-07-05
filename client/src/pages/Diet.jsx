import { useState } from "react";
import { useApp, dateKey } from "../context/AppContext.jsx";
import { nutritionTargets, engineLabel, goalLabel } from "../lib/calc.js";
import SuggestEdit from "../components/SuggestEdit.jsx";
import MealTracker from "../components/MealTracker.jsx";

export default function Diet() {
  const {
    profile,
    dietPlan: plan,
    setDietPlan: setPlan,
    mealLog,
    toggleMealEaten,
    eatenMeals,
    genState,
    generateDiet,
  } = useApp();
  // Generation status comes from context so it survives navigating away mid-generate.
  const { loading, error } = genState.diet;
  const [draft, setDraft] = useState(null); // non-null while editing
  const t = nutritionTargets(profile);

  // Today's eaten checkmarks on plan meals, plus the free-form meals logged via
  // "Plan As You Go" — together the running totals of what's been consumed.
  const eaten = mealLog[dateKey()] || {};
  const checkedMeals = plan?.meals?.filter((m) => eaten[m.name]) || [];
  const loggedMeals = eatenMeals[dateKey()] || [];
  const eatenCalories =
    checkedMeals.reduce((sum, m) => sum + (m.calories || 0), 0) +
    loggedMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
  const eatenProtein =
    checkedMeals.reduce((sum, m) => sum + (m.protein_g || 0), 0) +
    loggedMeals.reduce((sum, m) => sum + (m.protein_g || 0), 0);

  // "Eaten Today" progress is measured against the plan's own meals (their
  // summed calories/protein) so checking off every meal reads as 100% — AI
  // plans don't always sum exactly to the stated daily target. Fall back to the
  // target if the meals carry no per-meal numbers (or there's no plan at all).
  const planCalories = plan?.meals?.reduce((sum, m) => sum + (m.calories || 0), 0) || 0;
  const planProtein = plan?.meals?.reduce((sum, m) => sum + (m.protein_g || 0), 0) || 0;
  const calorieGoal = planCalories || plan?.daily_calories || t.calories;
  const proteinGoal = planProtein || plan?.macros?.protein_g || t.proteinG;

  // ---- editing helpers (operate on a draft copy) ----
  const startEdit = () => setDraft(structuredClone(plan));
  const cancelEdit = () => setDraft(null);
  const saveEdit = () => {
    setPlan({ ...draft, _edited: true });
    setDraft(null);
  };
  const patchDraft = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const patchMeal = (mi, patch) =>
    setDraft((d) => ({ ...d, meals: d.meals.map((m, i) => (i === mi ? { ...m, ...patch } : m)) }));
  const patchItems = (mi, fn) =>
    setDraft((d) => ({
      ...d,
      meals: d.meals.map((m, i) => (i === mi ? { ...m, items: fn(m.items) } : m)),
    }));
  const addItem = (mi) => patchItems(mi, (items) => [...items, "New item"]);
  const removeItem = (mi, ii) => patchItems(mi, (items) => items.filter((_, i) => i !== ii));
  const setItem = (mi, ii, val) =>
    patchItems(mi, (items) => items.map((it, i) => (i === ii ? val : it)));
  const addMeal = () =>
    setDraft((d) => ({
      ...d,
      meals: [
        ...d.meals,
        { name: "New Meal", time: "12:00 PM", items: [], calories: 0, protein_g: 0 },
      ],
    }));
  const removeMeal = (mi) => setDraft((d) => ({ ...d, meals: d.meals.filter((_, i) => i !== mi) }));

  const editing = draft !== null;
  const view = editing ? draft : plan;
  const macros = view?.macros || { protein_g: t.proteinG, carbs_g: t.carbsG, fat_g: t.fatG };
  // Macro bars show each macro's share of total *calories* (not grams), since
  // fat carries 9 kcal/g vs 4 kcal/g for protein and carbs.
  const totalKcal = macros.protein_g * 4 + macros.carbs_g * 4 + macros.fat_g * 9;

  return (
    <>
      <div className="page-head">
        <h1>AI Diet Plan</h1>
        <p>A meal plan tuned to your goal, body stats, and recovery needs.</p>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <span className="label">Daily calories</span>
          {editing ? (
            <input
              className="edit-inp"
              type="number"
              value={view.daily_calories}
              onChange={(e) => patchDraft({ daily_calories: Number(e.target.value) })}
            />
          ) : (
            <div className="value">
              {(view?.daily_calories || t.calories).toLocaleString()}
              <small> kcal</small>
            </div>
          )}
        </div>
        {[
          { m: "Protein", key: "protein_g", v: macros.protein_g, kcalPerG: 4, c: "var(--accent)" },
          { m: "Carbs", key: "carbs_g", v: macros.carbs_g, kcalPerG: 4, c: "var(--accent-2)" },
          { m: "Fat", key: "fat_g", v: macros.fat_g, kcalPerG: 9, c: "var(--accent-3)" },
        ].map((row) => (
          <div key={row.m} className="card stat">
            <span className="label">{row.m}</span>
            {editing ? (
              <input
                className="edit-inp"
                type="number"
                value={macros[row.key]}
                onChange={(e) =>
                  patchDraft({ macros: { ...view.macros, [row.key]: Number(e.target.value) } })
                }
              />
            ) : (
              <>
                <div className="value" style={{ color: row.c }}>
                  {row.v}
                  <small> g</small>
                </div>
                <div className="bar" style={{ marginTop: 4 }}>
                  <span
                    style={{
                      width: `${totalKcal ? ((row.v * row.kcalPerG) / totalKcal) * 100 : 0}%`,
                      background: row.c,
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="muted" style={{ fontSize: 13.5 }}>
            Target set for <b style={{ color: "var(--text)" }}>{goalLabel(profile)}</b> ·{" "}
            {profile.weightKg} kg · {profile.age} yrs
          </div>
          <div className="row" style={{ gap: 10 }}>
            {plan && !editing && (
              <button className="btn ghost" onClick={startEdit}>
                ✎ Edit
              </button>
            )}
            <button className="btn" onClick={generateDiet} disabled={loading || editing}>
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
          <div style={{ fontSize: 40, marginBottom: 10 }}>🥗</div>
          <p>
            Click <b>Generate plan</b> for a full day of meals hitting your calorie and macro
            targets.
          </p>
        </div>
      )}

      {loading && !plan && (
        <div className="card empty">
          <span className="spinner dark" style={{ width: 28, height: 28 }} />
          <p style={{ marginTop: 14 }}>The AI dietitian is planning your meals…</p>
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

      {(plan || loggedMeals.length > 0) && !editing && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-title-row">
            <h3>Eaten Today</h3>
            <span className="engine-tag">
              {plan ? `${checkedMeals.length}/${plan.meals.length} plan meals` : ""}
              {plan && loggedMeals.length > 0 ? " + " : ""}
              {loggedMeals.length > 0
                ? `${loggedMeals.length} logged meal${loggedMeals.length === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: 13.5 }}>
              <b style={{ color: "var(--text)" }}>{eatenCalories.toLocaleString()}</b> /{" "}
              {calorieGoal.toLocaleString()} kcal
              {" · "}
              <b style={{ color: "var(--text)" }}>{eatenProtein}</b> / {proteinGoal}g protein
            </span>
          </div>
          <div className="bar">
            <span
              style={{
                width: `${Math.min(100, (eatenCalories / calorieGoal) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* "Plan as you go" — log what was actually eaten, by text or photo, and
          get an AI nutrition estimate + rest-of-day guidance. Available with or
          without a generated plan. */}
      {!editing && (
        <MealTracker
          planEaten={checkedMeals.map((m) => ({
            name: m.name,
            calories: m.calories,
            protein_g: m.protein_g,
          }))}
        />
      )}

      {view && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-title-row">
              <h3>Plan Overview</h3>
              <span className="engine-tag">
                {view._edited ? "✎ Edited by you" : engineLabel(view._engine)}
              </span>
            </div>
            {editing ? (
              <>
                <textarea
                  className="edit-inp"
                  rows={2}
                  value={view.summary}
                  onChange={(e) => patchDraft({ summary: e.target.value })}
                />
                <textarea
                  className="edit-inp"
                  rows={2}
                  style={{ marginTop: 10 }}
                  value={view.notes}
                  onChange={(e) => patchDraft({ notes: e.target.value })}
                  placeholder="Notes"
                />
                <input
                  className="edit-inp"
                  style={{ marginTop: 10 }}
                  value={view.hydration}
                  onChange={(e) => patchDraft({ hydration: e.target.value })}
                  placeholder="Hydration"
                />
              </>
            ) : (
              <>
                <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 14px" }}>{view.summary}</p>
                <div className="callout">{view.notes}</div>
                <div className="callout" style={{ marginTop: 12 }}>
                  💧 {view.hydration}
                </div>
              </>
            )}
          </div>

          <div className="grid cols-2">
            {view.meals.map((m, i) => (
              <div key={i} className="card">
                {editing ? (
                  <>
                    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                      <input
                        className="edit-inp"
                        value={m.name}
                        onChange={(e) => patchMeal(i, { name: e.target.value })}
                        placeholder="Meal name"
                      />
                      <input
                        className="edit-inp sm"
                        style={{ width: 110 }}
                        value={m.time}
                        onChange={(e) => patchMeal(i, { time: e.target.value })}
                        placeholder="Time"
                      />
                      <button
                        className="icon-btn"
                        title="Remove meal"
                        onClick={() => removeMeal(i)}
                      >
                        ×
                      </button>
                    </div>
                    {m.items.map((it, j) => (
                      <div key={j} className="meal-item-edit">
                        <input
                          className="edit-inp sm"
                          value={it}
                          onChange={(e) => setItem(i, j, e.target.value)}
                        />
                        <button
                          className="icon-btn"
                          title="Remove item"
                          onClick={() => removeItem(i, j)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button className="add-btn" onClick={() => addItem(i)}>
                      + Add item
                    </button>
                    <div className="row" style={{ gap: 8, marginTop: 10 }}>
                      <input
                        className="edit-inp sm"
                        type="number"
                        value={m.calories}
                        onChange={(e) => patchMeal(i, { calories: Number(e.target.value) })}
                        title="Calories"
                      />
                      <input
                        className="edit-inp sm"
                        type="number"
                        value={m.protein_g}
                        onChange={(e) => patchMeal(i, { protein_g: Number(e.target.value) })}
                        title="Protein (g)"
                      />
                    </div>
                  </>
                ) : (
                  <div className={eaten[m.name] ? "meal-eaten" : ""}>
                    <div className="meal-head">
                      <label
                        className="meal-check"
                        title={eaten[m.name] ? "Eaten — click to undo" : "Mark as eaten"}
                      >
                        <input
                          type="checkbox"
                          checked={!!eaten[m.name]}
                          onChange={() => toggleMealEaten(m.name)}
                        />
                        <span className="mname">{m.name}</span>
                        {eaten[m.name] && <span className="eaten-tag">✓ eaten</span>}
                      </label>
                      <span className="mtime">{m.time}</span>
                    </div>
                    <div className="meal-items">
                      {m.items.map((it, j) => (
                        <div key={j}>• {it}</div>
                      ))}
                    </div>
                    <div className="meal-macros">
                      {m.calories} kcal · {m.protein_g}g protein
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {editing && (
            <button className="add-btn" onClick={addMeal}>
              + Add meal
            </button>
          )}

          {!editing && (
            <SuggestEdit
              kind="diet"
              plan={plan}
              setPlan={setPlan}
              placeholder="e.g. Make breakfast vegetarian, or swap dinner for something with more carbs"
            />
          )}
        </>
      )}
    </>
  );
}
