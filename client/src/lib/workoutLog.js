// Pure helpers for the workout log, shaped as
// { "YYYY-MM-DD": { [exerciseName]: [{ weight, reps }, …] } }.

// Canonical form of an exercise name for matching. Plan regenerations and
// coach edits can change capitalisation or spacing ("Preacher Curls" →
// "Preacher curls"); matching on the canonical form keeps one exercise's
// history in a single thread across those renames.
export function normalizeExercise(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// The key under which `exercise` is stored in one day's log — the exact name
// when present, otherwise a stored name that differs only in case/whitespace —
// or null when the day has no sets for it.
export function findExerciseKey(dayLog, exercise) {
  if (!dayLog) return null;
  if (dayLog[exercise]) return exercise;
  const want = normalizeExercise(exercise);
  return Object.keys(dayLog).find((k) => normalizeExercise(k) === want) || null;
}

// All sets logged for `exercise` on `day` ([] when none).
export function getDaySets(workoutLog, day, exercise) {
  const dayLog = workoutLog?.[day];
  const key = findExerciseKey(dayLog, exercise);
  return key ? dayLog[key] : [];
}

// Every logged session of `exercise` as [{ date, sets }], oldest first.
export function exerciseSessions(workoutLog, exercise) {
  return Object.keys(workoutLog || {})
    .sort()
    .map((date) => ({ date, sets: getDaySets(workoutLog, date, exercise) }))
    .filter((s) => s.sets.length > 0);
}

// Merge the server's workout log with this device's local copy. Used at boot
// when the local cache holds sets the server never confirmed receiving (saves
// that failed on a dead gym connection, or sets logged while the server was
// still waking up): a plain replace would destroy them. Dates and exercises
// are unioned; where both sides have sets for the same date + exercise the
// local array wins outright — it is the newer, unconfirmed edit, and taking it
// whole also honours set removals made on this device.
export function mergeWorkoutLogs(server, local) {
  const merged = {};
  const dates = new Set([...Object.keys(server || {}), ...Object.keys(local || {})]);
  for (const date of [...dates].sort()) {
    const day = { ...(server?.[date] || {}) };
    for (const [name, sets] of Object.entries(local?.[date] || {})) {
      // Local spelling of the name wins too, dropping a variant the server
      // may hold under different casing so the day never shows duplicates.
      const existing = findExerciseKey(day, name);
      if (existing && existing !== name) delete day[existing];
      day[name] = sets;
    }
    if (Object.keys(day).length) merged[date] = day;
  }
  return merged;
}
