import { useRef, useState } from "react";
import { useApp, dateKey } from "../context/AppContext.jsx";
import { nutritionTargets } from "../lib/calc.js";
import { analyzeMealRequest, friendlyError } from "../lib/api.js";
import { fileToInlineImage } from "../lib/image.js";

// "Plan as you go" — for users who don't follow the meal plan to the letter.
// Describe a meal in words and/or attach a photo; the AI estimates its
// nutrition (calories + macros, with stated assumptions and a confidence
// level) and advises how to steer the rest of the day. Analysed meals can be
// added to today's log, where they count toward the Eaten Today totals.
//
// `planEaten` is the list of plan meals already checked off today
// ({ name, calories, protein_g }) so the AI sees the full day, not just the
// free-form entries.
export default function MealTracker({ planEaten = [] }) {
  const { profile, eatenMeals, addEatenMeal, removeEatenMeal } = useApp();
  const t = nutritionTargets(profile);
  const fileRef = useRef(null);

  const [desc, setDesc] = useState("");
  const [photo, setPhoto] = useState(null); // { mimeType, data, previewUrl }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { meal, guidance }

  const today = dateKey();
  const logged = eatenMeals[today] || [];

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);
    try {
      setPhoto(await fileToInlineImage(file));
    } catch (err) {
      setError(err.message);
    }
  }

  async function analyze(e) {
    e.preventDefault();
    if (busy || (!desc.trim() && !photo)) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await analyzeMealRequest({
        description: desc.trim(),
        image: photo ? { mimeType: photo.mimeType, data: photo.data } : undefined,
        profile,
        targets: { calories: t.calories, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG },
        eatenToday: [
          ...planEaten,
          ...logged.map((m) => ({ name: m.name, calories: m.calories, protein_g: m.protein_g })),
        ],
      });
      if (res.ok) setResult({ meal: res.meal, guidance: res.guidance });
      else setError(res.reason || "The AI couldn't analyse that meal.");
    } catch (err) {
      setError(friendlyError(err, "Couldn't reach the AI — please try again."));
    } finally {
      setBusy(false);
    }
  }

  function addToLog() {
    const m = result.meal;
    addEatenMeal({
      name: m.name,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      time: new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    });
    // Clear the whole form — ready for the next meal.
    setResult(null);
    setDesc("");
    setPhoto(null);
  }

  const meal = result?.meal;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title-row">
        <h3>🍴 Plan As You Go</h3>
        <span className="engine-tag">AI nutrition estimate</span>
      </div>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: "0 0 12px" }}>
        Ate something off-plan? Describe it, or snap a photo, and the AI will estimate its
        nutrition and tell you how to handle the rest of the day.
      </p>

      {/* Meals already logged today via this tracker. */}
      {logged.length > 0 && (
        <div className="pag-logged">
          {logged.map((m) => (
            <div key={m.id} className="pag-logged-row">
              <span className="pag-logged-name">{m.name}</span>
              <span className="pag-logged-meta">
                {m.time ? `${m.time} · ` : ""}
                {m.calories} kcal · {m.protein_g}g protein
              </span>
              <button
                type="button"
                className="icon-btn"
                title="Remove from today's log"
                onClick={() => removeEatenMeal(m.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={analyze}>
        <textarea
          className="edit-inp"
          rows={2}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          maxLength={1000}
          placeholder='e.g. "2 chapatis with paneer curry and a bowl of curd" — or just attach a photo'
          disabled={busy}
        />
        <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={pickPhoto}
          />
          {photo ? (
            <span className="pag-photo">
              <img src={photo.previewUrl} alt="Meal to analyse" />
              <button
                type="button"
                className="pag-photo-x"
                title="Remove photo"
                onClick={() => setPhoto(null)}
              >
                ×
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              📷 Add a photo
            </button>
          )}
          <button className="btn sm" type="submit" disabled={busy || (!desc.trim() && !photo)}>
            {busy ? (
              <>
                <span className="spinner" /> Analysing…
              </>
            ) : (
              "Analyse meal"
            )}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Photos are analysed, never stored.
          </span>
        </div>
      </form>

      {error && (
        <div className="callout warn" style={{ marginTop: 12 }}>
          ⚠ {error}
        </div>
      )}

      {meal && (
        <div className="pag-result">
          <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span className="pag-result-name">{meal.name}</span>
            <span className={`pag-conf ${meal.confidence || "medium"}`}>
              {meal.confidence || "medium"} confidence
            </span>
          </div>
          {meal.items?.length > 0 && (
            <div className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
              {meal.items.join(" · ")}
            </div>
          )}
          <div className="pag-macros">
            {[
              { label: "kcal", v: meal.calories, c: "var(--text)" },
              { label: "protein", v: `${meal.protein_g}g`, c: "var(--accent)" },
              { label: "carbs", v: `${meal.carbs_g}g`, c: "var(--accent-2)" },
              { label: "fat", v: `${meal.fat_g}g`, c: "var(--accent-3)" },
            ].map((x) => (
              <span key={x.label} className="pag-macro">
                <b style={{ color: x.c }}>{x.v}</b> {x.label}
              </span>
            ))}
          </div>
          {meal.assumptions && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              Assumed: {meal.assumptions}
            </div>
          )}
          {result.guidance && (
            <div className="callout" style={{ marginTop: 12 }}>
              🧭 {result.guidance}
            </div>
          )}
          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            <button className="btn sm" onClick={addToLog}>
              + Add to today&apos;s log
            </button>
            <button className="btn ghost sm" onClick={() => setResult(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
