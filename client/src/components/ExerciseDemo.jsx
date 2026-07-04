// A small demo tile showing how to perform an exercise. When available it shows
// a real photo from the self-hosted exercise store (proxied by the server);
// while loading or when no match is found it shows a neutral placeholder tile
// with a dumbbell glyph — clean and unobtrusive, no assets, works offline.
//
// Clicking the demo opens an enlarged popup with the exercise's step-by-step
// description (from the exercise store, falling back to the plan's own note
// text).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { patternFor, PATTERN_LABELS } from "../lib/exerciseDemos.js";
import { fetchExerciseDemo } from "../lib/api.js";

// Neutral placeholder tile shown while loading or when no photo exists.
function DemoPlaceholder({ label, size, className = "" }) {
  return (
    <span
      className={`exdemo exdemo--placeholder ${className}`}
      style={{ width: size, height: size * 1.25 }}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg
        width={Math.max(18, Math.round(size * 0.45))}
        height={Math.max(18, Math.round(size * 0.45))}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />
      </svg>
    </span>
  );
}

// Renders the real photo when we have one, otherwise the placeholder tile.
function DemoVisual({ gifUrl, gifFailed, onError, label, size, className = "" }) {
  if (gifUrl && !gifFailed) {
    return (
      <img
        className={`exdemo exdemo--gif ${className}`}
        src={gifUrl}
        width={size}
        height={size * 1.25}
        loading="lazy"
        alt={label}
        title={label}
        onError={onError}
      />
    );
  }
  return <DemoPlaceholder label={label} size={size} className={className} />;
}

// The enlarged popup. Closes on overlay click, the × button, or Escape, and
// locks page scroll while open. Rendered into <body> so card overflow can't clip
// it.
function ExerciseModal({ name, label, info, gifUrl, gifFailed, onGifError, description, meta, onClose }) {
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

  const tags = info ? [info.target, info.bodyPart, info.equipment].filter(Boolean) : [];
  const steps = info?.instructions?.length ? info.instructions : null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={name}>
      <div className="modal exercise-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="exercise-modal-demo">
          <DemoVisual
            gifUrl={gifUrl}
            gifFailed={gifFailed}
            onError={onGifError}
            label={label}
            size={240}
            className="exdemo--lg"
          />
        </div>
        <h2 className="exercise-modal-title">{name}</h2>
        {meta && <div className="exercise-modal-meta">{meta}</div>}
        {tags.length > 0 && (
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {tags.map((t, i) => (
              <span key={i} className="pill moderate" style={{ textTransform: "capitalize" }}>
                {t}
              </span>
            ))}
          </div>
        )}
        {steps ? (
          <ol className="exercise-modal-steps">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : description ? (
          <p className="exercise-modal-desc">{description}</p>
        ) : (
          <p className="exercise-modal-desc muted">
            No step-by-step guide for this exercise — watch the demo above for the movement pattern.
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function ExerciseDemo({ name, size = 48, description = "", meta = "" }) {
  const pattern = patternFor(name);
  const label = `How to perform: ${name} — ${PATTERN_LABELS[pattern]}`;

  // Try for a real animated GIF + details from the server (ExerciseDB).
  const [demo, setDemo] = useState({ gifUrl: null, info: null });
  const [gifFailed, setGifFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setGifFailed(false);
    fetchExerciseDemo(name).then((d) => {
      if (active) setDemo(d);
    });
    return () => {
      active = false;
    };
  }, [name]);

  return (
    <>
      <button
        type="button"
        className="exdemo-btn"
        onClick={() => setOpen(true)}
        title="Click to enlarge"
        aria-label={`${label}. Click to enlarge.`}
      >
        <DemoVisual
          gifUrl={demo.gifUrl}
          gifFailed={gifFailed}
          onError={() => setGifFailed(true)}
          label={label}
          size={size}
        />
      </button>
      {open && (
        <ExerciseModal
          name={name}
          label={label}
          info={demo.info}
          gifUrl={demo.gifUrl}
          gifFailed={gifFailed}
          onGifError={() => setGifFailed(true)}
          description={description}
          meta={meta}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
