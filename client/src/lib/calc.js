// Client-side mirror of the fitness math, plus simulated daily activity so the
// dashboard is populated even before the user logs anything manually.

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function bmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "female" ? base - 161 : base + 5);
}

export function tdee(p) {
  return Math.round(bmr(p) * (ACTIVITY_FACTORS[p.activityLevel] ?? 1.375));
}

export function nutritionTargets(p) {
  const maintenance = tdee(p);
  const goal = p.goal || "maintain";
  let calories = maintenance;
  if (goal === "weight_loss") calories = Math.round(maintenance * 0.8);
  else if (goal === "muscle_gain") calories = Math.round(maintenance * 1.1);
  else if (goal === "recomp") calories = Math.round(maintenance * 0.95);

  const proteinPerKg =
    goal === "muscle_gain" || goal === "recomp" || goal === "hybrid"
      ? 2.0
      : goal === "weight_loss"
        ? 1.8
        : 1.6;
  const proteinG = Math.round(p.weightKg * proteinPerKg);
  const fatG = Math.round((calories * 0.27) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  return { maintenance, calories, proteinG, carbsG, fatG };
}

export function readinessScore(r = {}) {
  const {
    sleepHours = 7,
    restingHr = 60,
    soreness = 3,
    stress = 3,
    hoursSinceWorkout = 24,
    hrv = 55,
  } = r;
  let score = 45;
  score += Math.max(-20, Math.min(20, (sleepHours - 6) * 8));
  score += Math.max(-15, Math.min(15, (60 - restingHr) * 1.2));
  score += Math.max(-15, Math.min(15, (hrv - 55) * 0.4));
  score -= (soreness - 1) * 6;
  score -= (stress - 1) * 4;
  score += Math.min(15, (hoursSinceWorkout / 24) * 10);
  return Math.max(5, Math.min(100, Math.round(score)));
}

export function readinessBand(score) {
  if (score >= 80) return "peak";
  if (score >= 60) return "ready";
  if (score >= 40) return "moderate";
  return "low";
}

// Deterministic pseudo-random so "today's" simulated numbers are stable per day.
function seeded(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Daily activity for the dashboard. Prefers real numbers synced from a connected
// fitness tracker (`tracked` is today's daily_activity row from the server);
// otherwise falls back to logged values, then to a stable per-day simulation so
// the dashboard still demos without a device.
export function todayActivity(profile, log = {}, tracked = null) {
  if (tracked && (tracked.steps != null || tracked.calories_out != null)) {
    const steps = tracked.steps ?? 0;
    const activeMinutes = tracked.active_minutes ?? 0;
    return {
      steps,
      stepGoal: 10000,
      workoutMinutes: activeMinutes,
      caloriesBurned: tracked.calories_out ?? 0,
      activeMinutes,
      activitiesCompleted: log.activitiesCompleted ?? (activeMinutes >= 30 ? 1 : 0),
      source: tracked.provider, // e.g. "fitbit" — lets the UI label real data
    };
  }
  const day = new Date();
  const seed = day.getFullYear() * 1000 + day.getMonth() * 50 + day.getDate();
  const baseSteps =
    profile.activityLevel === "very_active"
      ? 11000
      : profile.activityLevel === "active"
        ? 9000
        : profile.activityLevel === "moderate"
          ? 7000
          : 5000;
  const steps = log.steps ?? Math.round(baseSteps * (0.7 + seeded(seed) * 0.6));
  const workoutMinutes =
    log.workoutMinutes ?? (seeded(seed + 1) > 0.4 ? Math.round(35 + seeded(seed + 2) * 35) : 0);
  const weightFactor = profile.weightKg / 70;
  const caloriesBurned = Math.round(
    steps * 0.04 * weightFactor + workoutMinutes * 8 * weightFactor + bmr(profile) * 0.3
  );
  const activeMinutes = Math.round(workoutMinutes + steps / 110);

  return {
    steps,
    stepGoal: 10000,
    workoutMinutes,
    caloriesBurned,
    activeMinutes,
    activitiesCompleted: log.activitiesCompleted ?? (workoutMinutes > 0 ? 1 : 0),
    source: null, // estimated, not from a device
  };
}

// Estimate VO2 max (ml/kg/min) from resting HR and age — the Uth–Sørensen
// method: VO2max ≈ 15.3 × (HRmax / HRrest), with HRmax from Tanaka (208 − 0.7·age).
export function vo2max(profile, recovery = {}) {
  const age = profile.age || 30;
  const restingHr = recovery.restingHr || 60;
  const hrMax = 208 - 0.7 * age;
  return Math.round(15.3 * (hrMax / restingHr));
}

export function vo2maxRating(v) {
  if (v >= 52) return "excellent";
  if (v >= 44) return "good";
  if (v >= 36) return "fair";
  return "needs work";
}

// HRV interpretation band (RMSSD, ms — higher is better recovered).
export function hrvBand(hrv) {
  if (hrv >= 70) return "high";
  if (hrv >= 50) return "balanced";
  if (hrv >= 35) return "moderate";
  return "low";
}

// Spread N training days across a week (Monday-first) with rest days between
// them, so a weekly workout plan can be projected onto a calendar. Values are
// JS weekday numbers (0 = Sun … 6 = Sat).
const WEEKDAY_PATTERNS = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

// The default Monday-first weekday spread for N training days per week.
export function defaultTrainingDays(n) {
  return WEEKDAY_PATTERNS[Math.min(7, Math.max(1, n || 1))] || WEEKDAY_PATTERNS[3];
}

// Monday-first ordering key for a JS weekday (Mon → 0 … Sun → 6).
const weekOrder = (wd) => (wd + 6) % 7;

// Map a workout plan's days onto weekdays: { [weekday 0-6]: dayObject }.
// If `trainingDays` (user-chosen weekday numbers) is given, the plan's days are
// assigned to those weekdays in calendar order; otherwise the default spread for
// the number of training days is used.
export function workoutSchedule(plan, trainingDays) {
  const days = plan?.days || [];
  if (!days.length) return {};
  const weekdays =
    Array.isArray(trainingDays) && trainingDays.length
      ? [...trainingDays].sort((a, b) => weekOrder(a) - weekOrder(b))
      : WEEKDAY_PATTERNS[Math.min(7, days.length)] || WEEKDAY_PATTERNS[3];
  const map = {};
  days.forEach((d, i) => {
    const wd = weekdays[i % weekdays.length];
    if (wd !== undefined && map[wd] === undefined) map[wd] = d;
  });
  return map;
}

// The scheduled workout (day object) for a given JS Date, or null on a rest day.
export function workoutForDate(plan, date, trainingDays) {
  return workoutSchedule(plan, trainingDays)[date.getDay()] || null;
}

// The workout that is effectively on a date once the user's per-day calendar
// overrides are applied: a hidden (removed) scheduled workout yields null, and
// a rest day the user added a plan session to (calEntry.addWorkoutIdx) yields
// that session. Falls back to the plain schedule.
export function effectiveWorkoutForDate(plan, date, trainingDays, calEntry) {
  const sched = workoutForDate(plan, date, trainingDays);
  if (sched) return calEntry?.hideWorkout ? null : sched;
  const idx = calEntry?.addWorkoutIdx;
  return Number.isInteger(idx) ? plan?.days?.[idx] || null : null;
}

// ---- Weekly cardio / flexibility / recovery scheduling ---------------------
// Fills the gaps around strength days so the week reads as a complete
// programme: cardio volume follows the goal (mirroring the Cardio page),
// flexibility gets its own day — or rides along after the week's last lift
// when every day is taken — and the final free day stays pure recovery.
// Durations and wording adapt to age (gentler and low-impact for 50+).
// Deterministic per profile, so the calendar doesn't reshuffle day to day.
// Returns { [weekday 0-6]: { type, title, detail, duration_min, withWorkout? } }.
export function weeklyExtras(profile, plan, trainingDays) {
  const goal = profile?.goal || "maintain";
  const senior = (profile?.age || 30) >= 50;

  // The weekdays strength training occupies — the same mapping the calendar
  // uses; without a plan, the user's chosen/default training days still hold.
  const strengthSet = plan
    ? new Set(Object.keys(workoutSchedule(plan, trainingDays)).map(Number))
    : new Set(
        Array.isArray(trainingDays) && trainingDays.length
          ? trainingDays
          : defaultTrainingDays(profile?.daysPerWeek)
      );

  const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
  const rest = MON_FIRST.filter((wd) => !strengthSet.has(wd));
  const extras = {};

  // The week's last free day (typically Sunday) stays untouched recovery.
  if (rest.length) {
    extras[rest[rest.length - 1]] = {
      type: "recovery",
      title: "Rest & recovery",
      duration_min: 0,
      detail: senior
        ? "Full rest day: prioritise sleep, hydration, and a gentle stroll. Recovery is where adaptation happens — it matters even more past 50."
        : "Full rest day: prioritise sleep and hydration; an easy walk is fine. This is where your body actually adapts and grows.",
    };
  }

  // Cardio volume by goal, capped so recovery keeps its day.
  const cardioTarget = goal === "endurance" ? 3 : goal === "muscle_gain" ? 1 : 2;
  rest.slice(0, Math.min(cardioTarget, Math.max(0, rest.length - 1))).forEach((wd) => {
    extras[wd] = {
      type: "cardio",
      title:
        goal === "endurance"
          ? "Zone 2 endurance cardio"
          : goal === "muscle_gain"
            ? "Easy Zone 2 cardio"
            : "Zone 2 cardio",
      duration_min: senior ? 30 : goal === "endurance" ? 45 : goal === "muscle_gain" ? 20 : 35,
      detail: senior
        ? "Low-impact steady cardio — brisk walk, cycle, or swim — at a conversational pace."
        : goal === "muscle_gain"
          ? "Short and easy — supports heart health and recovery without eating into strength gains."
          : "Steady, conversational pace — the foundation of endurance and fat metabolism.",
    };
  });

  // Flexibility: its own day when one is free; otherwise 10-15 min straight
  // after the week's last strength session, while muscles are warm. Seniors
  // get it on every remaining free day — mobility and balance work matter
  // most with age.
  const flexExtra = {
    type: "flexibility",
    title: senior ? "Mobility, stretching & balance" : "Stretching & mobility",
    duration_min: senior ? 25 : 20,
    detail: senior
      ? "Gentle full-body mobility with balance holds — key for joint health and fall prevention."
      : "Full-body stretch & mobility session — hips, spine, shoulders, hamstrings.",
  };
  const free = rest.filter((wd) => !extras[wd]);
  if (free.length) {
    (senior ? free : free.slice(0, 1)).forEach((wd) => {
      extras[wd] = { ...flexExtra };
    });
  } else {
    const lastStrength = [...MON_FIRST].reverse().find((wd) => strengthSet.has(wd));
    if (lastStrength !== undefined) {
      extras[lastStrength] = {
        ...flexExtra,
        withWorkout: true,
        duration_min: 15,
        detail: "10–15 minutes of stretching straight after training, while muscles are warm.",
      };
    }
  }
  return extras;
}

// Display metadata for the scheduled extras (icon, colour, destination page).
export const EXTRA_META = {
  cardio: { label: "Cardio", icon: "🏃", color: "var(--accent-2)", to: "/cardio", cta: "Open Cardio" },
  flexibility: {
    label: "Flexibility",
    icon: "🧘",
    color: "var(--accent-3)",
    to: "/flexibility",
    cta: "Open Flexibility",
  },
  recovery: {
    label: "Recovery",
    icon: "😴",
    color: "var(--muted)",
    to: "/workout",
    cta: "View recovery plan",
  },
};

// User-addable activity types (a run, mobility work, etc.) with a colour used
// for calendar dots and activity pills. Shared by the Calendar and Dashboard.
export const ACTIVITY_TYPES = [
  { value: "cardio", label: "Cardio / Run", color: "var(--accent-2)" },
  { value: "flexibility", label: "Flexibility", color: "var(--accent-3)" },
  { value: "mobility", label: "Mobility", color: "var(--accent)" },
  { value: "sport", label: "Sport", color: "var(--warn)" },
  { value: "other", label: "Other", color: "var(--muted)" },
];
export const activityType = (v) =>
  ACTIVITY_TYPES.find((t) => t.value === v) || ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];

// Friendly credit for whichever engine produced a plan.
export function engineLabel(engine) {
  switch (engine) {
    case "claude":
      return "✦ Generated by Claude";
    case "gemini":
      return "✦ Generated by Gemini";
    case "ollama":
      return "✦ Generated by local AI";
    default:
      return "Rule-based plan";
  }
}

export const GOALS = [
  { value: "weight_loss", label: "Weight Loss" },
  { value: "muscle_gain", label: "Muscle Gain" },
  { value: "recomp", label: "Body Recomposition" },
  { value: "maintain", label: "Maintain / General Health" },
  { value: "endurance", label: "Endurance" },
  { value: "hybrid", label: "Hybrid Training" },
  { value: "other", label: "Other (write your own)" },
];

// Human-readable goal for display: the user's own words for "other", else the
// option's label. Targets math treats unknown goals as maintenance, so a
// custom goal is always safe — the AI planners get the custom text via the
// prompt context and tailor plans to it there.
export function goalLabel(profile) {
  if (profile?.goal === "other" && profile?.goalCustom?.trim()) return profile.goalCustom.trim();
  return GOALS.find((g) => g.value === profile?.goal)?.label || "General Health";
}

export const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sedentary (desk job, little exercise)" },
  { value: "light", label: "Lightly active (1-3 days/week)" },
  { value: "moderate", label: "Moderately active (3-5 days/week)" },
  { value: "active", label: "Very active (6-7 days/week)" },
  { value: "very_active", label: "Athlete (2x/day or physical job)" },
];
