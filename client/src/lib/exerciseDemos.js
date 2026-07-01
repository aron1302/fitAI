// Maps a free-form exercise name to one of a small set of movement-pattern
// animations shown next to the exercise so the user can see how to perform it.
//
// Workout exercise names are AI/rule-generated and free-form, so we keyword-match
// the name to a pattern. Flexibility drills have fixed names that match the same
// way. Anything unmatched falls back to a generic "stretch" demo.
//
// To swap in real GIFs later, keep these pattern ids and point ExerciseDemo at
// `/demos/<pattern>.gif` instead of the built-in SVG — the mapping stays the same.

// Order matters: earlier rules win, so put more specific patterns first.
const RULES = [
  { pattern: "rotation", kw: ["cat", "cow", "open-book", "open book", "thoracic", "spine", "twist", "rotation"] },
  { pattern: "balance", kw: ["single-leg", "single leg", "balance", "one-leg", "one leg", "stork"] },
  { pattern: "hinge", kw: ["deadlift", "rdl", "romanian", "hinge", "good morning", "hip thrust", "glute bridge", "swing", "hip-flexor", "hip flexor", "90/90", "hip switch"] },
  { pattern: "pull", kw: ["row", "pull-up", "pullup", "pull up", "pulldown", "pull-down", "chin", "lat ", "face pull", "pass-through", "wall slide"] },
  { pattern: "press", kw: ["press", "push-up", "pushup", "push up", "bench", "dip", "overhead", "push"] },
  { pattern: "curl", kw: ["curl", "raise", "fly", "flye", "extension", "kickback"] },
  { pattern: "core", kw: ["plank", "crunch", "sit-up", "situp", "dead bug", "hollow", "core", "ab ", "hold"] },
  { pattern: "squat", kw: ["squat", "lunge", "step-up", "step up", "leg press", "split", "wall sit"] },
  { pattern: "stretch", kw: ["stretch", "hamstring", "calf", "ankle", "neck", "trap", "mobility", "shoulder", "rock"] },
];

// Human-readable label for each pattern, used in the tooltip/caption.
export const PATTERN_LABELS = {
  squat: "Squat / lunge pattern",
  hinge: "Hip-hinge pattern",
  press: "Pressing pattern",
  pull: "Pulling pattern",
  curl: "Arm curl / raise",
  core: "Core / hold",
  rotation: "Spinal rotation",
  balance: "Single-leg balance",
  stretch: "Stretch / mobility",
};

// Return the movement pattern id for an exercise name (defaults to "stretch").
export function patternFor(name = "") {
  const n = name.toLowerCase();
  for (const { pattern, kw } of RULES) {
    if (kw.some((k) => n.includes(k))) return pattern;
  }
  return "stretch";
}
