import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext.jsx";

// Compact date for a YYYY-MM-DD key, with the year only when it differs from
// the current one ("Jun 28" / "Dec 30, 2025").
function fmtDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  const opts = { month: "short", day: "numeric" };
  if (y !== new Date().getFullYear()) opts.year = "numeric";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

// Signed change vs the previous session, coloured up/down. Hidden when there is
// no previous session or nothing changed.
function Delta({ v, unit }) {
  if (v == null || v === 0) return null;
  const up = v > 0;
  const abs = Math.round(Math.abs(v) * 10) / 10;
  return (
    <span className={`hx-delta ${up ? "up" : "down"}`}>
      {up ? "↑" : "↓"}
      {abs.toLocaleString()}
      {unit}
    </span>
  );
}

// Every logged session of one exercise, newest first, as a modal: the sets
// performed, top weight and volume, and the change vs the session before it —
// so any past workout can be compared with the current one at a glance.
// `baselineDay` is the date the modal was opened from and gets highlighted.
export default function ExerciseHistory({ exercise, baselineDay, onClose }) {
  const { workoutLog } = useApp();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Oldest → newest to compute each session's change, then newest first to read.
  const sessions = Object.keys(workoutLog)
    .filter((d) => workoutLog[d]?.[exercise]?.length)
    .sort()
    .map((date) => {
      const sets = workoutLog[date][exercise];
      return {
        date,
        sets,
        top: Math.max(0, ...sets.map((s) => s.weight || 0)),
        volume: sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0),
      };
    });
  sessions.forEach((s, i) => {
    s.dTop = i > 0 ? s.top - sessions[i - 1].top : null;
    s.dVol = i > 0 ? s.volume - sessions[i - 1].volume : null;
  });
  const rows = [...sessions].reverse();

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`History: ${exercise}`}
    >
      <div className="modal hx-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className="hx-title">{exercise}</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
          {rows.length
            ? `${rows.length} logged session${rows.length === 1 ? "" : "s"} — changes are vs the session before.`
            : "No sets logged for this exercise yet."}
        </div>
        {rows.map((r) => (
          <div key={r.date} className={`hx-row${r.date === baselineDay ? " sel" : ""}`}>
            <div className="hx-row-head">
              <span className="hx-date">
                {fmtDate(r.date)}
                {r.date === baselineDay && <span className="hx-tag">viewing</span>}
              </span>
              <span className="hx-stats">
                top {r.top.toLocaleString()} kg <Delta v={r.dTop} unit=" kg" /> ·{" "}
                {r.volume.toLocaleString()} kg vol <Delta v={r.dVol} unit=" kg" />
              </span>
            </div>
            <div className="hx-sets">
              {r.sets.map((s, i) => (
                <span key={i} className="set-chip">
                  <b>{i + 1}</b>
                  {s.weight ? `${s.weight} kg` : "BW"} × {s.reps}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
