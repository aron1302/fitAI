// Shared fitness math used by the rule-based fallback engine and exposed so the
// AI prompts can be grounded in real numbers. Pure functions, no dependencies.

export function bmr({ sex, weightKg, heightCm, age }) {
  // Mifflin-St Jeor
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "female" ? base - 161 : base + 5);
}

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function tdee(profile) {
  const factor = ACTIVITY_FACTORS[profile.activityLevel] ?? 1.375;
  return Math.round(bmr(profile) * factor);
}

// Calorie + macro targets based on goal. Returns grams and kcal.
export function nutritionTargets(profile) {
  const maintenance = tdee(profile);
  const goal = profile.goal || "maintain";

  let calories = maintenance;
  if (goal === "weight_loss") calories = Math.round(maintenance * 0.8);
  else if (goal === "muscle_gain") calories = Math.round(maintenance * 1.1);
  else if (goal === "recomp") calories = Math.round(maintenance * 0.95);
  // maintain / endurance stay at maintenance

  // Protein scales with bodyweight and goal.
  const proteinPerKg =
    goal === "muscle_gain" || goal === "recomp" || goal === "hybrid"
      ? 2.0
      : goal === "weight_loss"
        ? 1.8
        : 1.6;
  const proteinG = Math.round(profile.weightKg * proteinPerKg);
  const fatG = Math.round((calories * 0.27) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  return { maintenance, calories, proteinG, carbsG, fatG };
}

// Daily calorie burn estimate from activity + exercise (for the dashboard).
export function activeBurn(profile, { steps = 0, workoutMinutes = 0 } = {}) {
  const stepKcal = steps * 0.04; // rough kcal per step scaled by weight handled below
  const weightFactor = profile.weightKg / 70;
  const workoutKcal = workoutMinutes * 8 * weightFactor; // ~8 kcal/min moderate
  return Math.round(stepKcal * weightFactor + workoutKcal);
}

// Readiness score 0-100 from recovery inputs. Higher = more recovered.
export function readinessScore({
  sleepHours = 7,
  restingHr = 60,
  soreness = 3, // 1 (none) - 5 (severe)
  stress = 3, // 1 (low) - 5 (high)
  hoursSinceWorkout = 24,
  hrv = 55, // heart-rate variability (RMSSD, ms) — higher is more recovered
} = {}) {
  let score = 45;
  // Sleep: 8h ideal
  score += Math.max(-20, Math.min(20, (sleepHours - 6) * 8));
  // Resting HR: lower is better, 55 baseline
  score += Math.max(-15, Math.min(15, (60 - restingHr) * 1.2));
  // HRV: higher is better, ~55ms baseline
  score += Math.max(-15, Math.min(15, (hrv - 55) * 0.4));
  // Soreness penalty
  score -= (soreness - 1) * 6;
  // Stress penalty
  score -= (stress - 1) * 4;
  // Recovery time bonus
  score += Math.min(15, (hoursSinceWorkout / 24) * 10);
  return Math.max(5, Math.min(100, Math.round(score)));
}

export function readinessBand(score) {
  if (score >= 80) return "peak";
  if (score >= 60) return "ready";
  if (score >= 40) return "moderate";
  return "low";
}
