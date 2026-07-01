// A small looping animation showing how to perform an exercise. When available
// it shows a real animated GIF from ExerciseDB (proxied by the server); while
// loading or when no match is found it falls back to a built-in animated stick
// figure drawn in SVG (SMIL <animateTransform>, no assets, works offline). The
// pattern is chosen from the exercise name in exerciseDemos.js.
//
// Clicking the demo opens an enlarged popup with the exercise's step-by-step
// description (from ExerciseDB, falling back to the plan's own note text).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { patternFor, PATTERN_LABELS } from "../lib/exerciseDemos.js";
import { fetchExerciseDemo } from "../lib/api.js";

// Pivot points in the SVG's 80×100 user space.
const HIP = "40 62";
const SHOULDER = "40 38";

// Shorthand for a looping transform animation on the wrapping <g>.
function Spin({ values, keyTimes = "0;0.5;1", dur = 1.6 }) {
  return (
    <animateTransform
      attributeName="transform"
      attributeType="XML"
      type="rotate"
      values={values}
      keyTimes={keyTimes}
      dur={`${dur}s`}
      repeatCount="indefinite"
      calcMode="spline"
      keySplines={keyTimes.split(";").slice(1).map(() => "0.4 0 0.6 1").join(";")}
    />
  );
}
function Shift({ values, dur = 1.6 }) {
  return (
    <animateTransform
      attributeName="transform"
      attributeType="XML"
      type="translate"
      values={values}
      keyTimes="0;0.5;1"
      dur={`${dur}s`}
      repeatCount="indefinite"
      calcMode="spline"
      keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
    />
  );
}

// Which segment animates, and how, for each pattern. `anims` maps a segment
// name (fig | upper | arm | legFront) to the animation element it carries.
function animsFor(pattern) {
  switch (pattern) {
    case "squat":
      return { fig: <Shift values="0 0;0 16;0 0" dur={1.8} /> };
    case "hinge":
      return { upper: <Spin values={`0 ${HIP};54 ${HIP};0 ${HIP}`} dur={1.9} /> };
    case "press":
      return { arm: <Spin values={`0 ${SHOULDER};175 ${SHOULDER};0 ${SHOULDER}`} dur={1.5} /> };
    case "pull":
      return { arm: <Spin values={`0 ${SHOULDER};58 ${SHOULDER};0 ${SHOULDER}`} dur={1.3} /> };
    case "curl":
      return { arm: <Spin values={`0 ${SHOULDER};120 ${SHOULDER};0 ${SHOULDER}`} dur={1.2} /> };
    case "core":
      return { upper: <Spin values={`0 ${HIP};-10 ${HIP};0 ${HIP}`} dur={2.4} /> };
    case "rotation":
      return {
        upper: (
          <Spin values={`0 ${HIP};16 ${HIP};0 ${HIP};-16 ${HIP};0 ${HIP}`} keyTimes="0;0.25;0.5;0.75;1" dur={2.2} />
        ),
      };
    case "balance":
      return { legFront: <Spin values={`0 ${HIP};-40 ${HIP};0 ${HIP}`} dur={2.2} /> };
    case "stretch":
    default:
      return {
        upper: (
          <Spin values={`0 ${HIP};14 ${HIP};0 ${HIP};-14 ${HIP};0 ${HIP}`} keyTimes="0;0.25;0.5;0.75;1" dur={3} />
        ),
      };
  }
}

// The animated SVG stick figure for a movement pattern.
function StickFigure({ pattern, label, size, className = "" }) {
  const a = animsFor(pattern);
  return (
    <svg
      className={`exdemo ${className}`}
      width={size}
      height={size * 1.25}
      viewBox="0 0 80 100"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <g>
          {a.fig}
          <line x1="40" y1="62" x2="30" y2="92" />
          <g>
            {a.legFront}
            <line x1="40" y1="62" x2="50" y2="92" />
          </g>
          <g>
            {a.upper}
            <line x1="40" y1="33" x2="40" y2="62" />
            <circle cx="40" cy="25" r="8" fill="currentColor" stroke="none" />
            <g>
              {a.arm}
              <line x1="40" y1="38" x2="40" y2="60" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

// Renders the real GIF when we have one, otherwise the animated SVG.
function DemoVisual({ gifUrl, gifFailed, onError, pattern, label, size, className = "" }) {
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
  return <StickFigure pattern={pattern} label={label} size={size} className={className} />;
}

// The enlarged popup. Closes on overlay click, the × button, or Escape, and
// locks page scroll while open. Rendered into <body> so card overflow can't clip
// it.
function ExerciseModal({ name, pattern, label, info, gifUrl, gifFailed, onGifError, description, meta, onClose }) {
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
            pattern={pattern}
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
          pattern={pattern}
          label={label}
          size={size}
        />
      </button>
      {open && (
        <ExerciseModal
          name={name}
          pattern={pattern}
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
