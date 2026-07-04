// Rule-based planning engine. Used when no ANTHROPIC_API_KEY is configured so
// every feature works offline, and as a safety net if an AI call fails.

import { nutritionTargets, readinessBand, readinessScore } from "./targets.js";

const GOAL_LABELS = {
  weight_loss: "fat loss",
  muscle_gain: "muscle gain",
  recomp: "body recomposition",
  maintain: "maintenance",
  endurance: "endurance",
  hybrid: "hybrid training",
};

function impairmentFlags(profile) {
  const list = (profile.impairments || []).map((s) => s.toLowerCase());
  const text = list.join(" ");
  return {
    knee: /knee|acl|meniscus|patell/.test(text),
    back: /back|spine|disc|lumbar|sciatic/.test(text),
    shoulder: /shoulder|rotator|cuff/.test(text),
    wrist: /wrist|carpal/.test(text),
    any: list.length > 0,
    raw: profile.impairments || [],
  };
}

// Pick a training split based on days available and goal.
function chooseSplit(days) {
  if (days <= 2) return ["Full Body A", "Full Body B"].slice(0, days);
  if (days === 3) return ["Full Body A", "Full Body B", "Full Body C"];
  if (days === 4)
    return ["Upper Strength", "Lower Strength", "Upper Hypertrophy", "Lower Hypertrophy"];
  if (days === 5) return ["Push", "Pull", "Legs", "Upper", "Lower"];
  return ["Push", "Pull", "Legs", "Push", "Pull", "Legs"].slice(0, days);
}

const EXERCISE_BANK = {
  push: [
    { name: "Barbell Bench Press", joint: "shoulder" },
    { name: "Incline Dumbbell Press", joint: "shoulder" },
    { name: "Overhead Press", joint: "shoulder" },
    { name: "Cable Fly", joint: null },
    { name: "Triceps Pushdown", joint: null },
  ],
  pull: [
    { name: "Pull-ups / Lat Pulldown", joint: null },
    { name: "Barbell Row", joint: "back" },
    { name: "Seated Cable Row", joint: null },
    { name: "Face Pull", joint: null },
    { name: "Dumbbell Curl", joint: "wrist" },
  ],
  legs: [
    { name: "Back Squat", joint: "knee" },
    { name: "Romanian Deadlift", joint: "back" },
    { name: "Leg Press", joint: "knee" },
    { name: "Leg Curl", joint: null },
    { name: "Standing Calf Raise", joint: null },
  ],
  full: [
    { name: "Goblet Squat", joint: "knee" },
    { name: "Dumbbell Bench Press", joint: "shoulder" },
    { name: "One-Arm Dumbbell Row", joint: "back" },
    { name: "Romanian Deadlift", joint: "back" },
    { name: "Plank", joint: null },
  ],
};

const SUBSTITUTIONS = {
  knee: "Leg Extension (partial ROM) or Box Squat to comfortable depth",
  back: "Chest-Supported Row or Hip Thrust (neutral spine)",
  shoulder: "Neutral-grip / landmine press in pain-free range",
  wrist: "Use straps or switch to machine/cable variation",
};

function exercisesFor(dayName, flags, intensity) {
  let pool;
  const lower = dayName.toLowerCase();
  if (lower.includes("push")) pool = EXERCISE_BANK.push;
  else if (lower.includes("pull")) pool = EXERCISE_BANK.pull;
  else if (lower.includes("leg") || lower.includes("lower")) pool = EXERCISE_BANK.legs;
  else if (lower.includes("upper"))
    pool = [...EXERCISE_BANK.push.slice(0, 3), ...EXERCISE_BANK.pull.slice(0, 2)];
  else pool = EXERCISE_BANK.full;

  const setScheme =
    intensity === "low"
      ? { sets: 2, reps: "12-15" }
      : intensity === "high"
        ? { sets: 4, reps: "5-8" }
        : { sets: 3, reps: "8-12" };

  return pool.map((ex) => {
    let notes = "Control the eccentric, leave 1-2 reps in reserve.";
    if (ex.joint && flags[ex.joint]) {
      notes = `⚠ Modify for your ${ex.joint}: ${SUBSTITUTIONS[ex.joint]}.`;
    }
    return { name: ex.name, sets: setScheme.sets, reps: setScheme.reps, notes };
  });
}

export function generateWorkoutPlan(profile, recovery) {
  const score = recovery?.readiness ?? readinessScore(recovery || {});
  const band = readinessBand(score);
  const flags = impairmentFlags(profile);
  const days = Math.min(6, Math.max(2, profile.daysPerWeek || 4));
  const split = chooseSplit(days);

  // Readiness drives intensity.
  const intensity =
    band === "peak" || band === "ready"
      ? profile.goal === "muscle_gain"
        ? "high"
        : "moderate"
      : band === "moderate"
        ? "moderate"
        : "low";

  const dayPlans = split.map((focus) => {
    const ex = exercisesFor(focus, flags, intensity);
    const duration = 30 + ex.length * (intensity === "high" ? 9 : 7);
    return {
      day: focus,
      focus,
      intensity,
      duration_min: duration,
      exercises: ex,
    };
  });

  let readinessGuidance;
  if (band === "low")
    readinessGuidance =
      "Your readiness is low — this plan is deloaded (lighter weights, higher reps, fewer sets). Prioritise sleep and an easy walk; skip to a rest day if you feel run down.";
  else if (band === "moderate")
    readinessGuidance =
      "Moderate readiness — train at a controlled effort, stop 2-3 reps short of failure and keep rest periods generous.";
  else
    readinessGuidance =
      "You're well recovered — push the working sets, you can add load or an extra set where it feels strong.";

  const cautions = flags.any
    ? `Plan adjusted around your noted impairments (${flags.raw.join(", ")}). Movements flagged with ⚠ have a safer substitution. Stop any exercise that causes sharp pain.`
    : "No impairments on file. Warm up thoroughly and progress load gradually.";

  return {
    summary: `${days}-day ${GOAL_LABELS[profile.goal] || "general fitness"} program, auto-scaled to today's readiness (${score}/100, ${band}).`,
    weekly_focus: `${GOAL_LABELS[profile.goal] || "Balanced training"} with ${intensity} intensity this week.`,
    days: dayPlans,
    readiness_guidance: readinessGuidance,
    cautions,
    _engine: "rule-based",
  };
}

export function generateDietPlan(profile) {
  const t = nutritionTargets(profile);
  const goal = GOAL_LABELS[profile.goal] || "maintenance";

  // Distribute calories across 4 meals.
  const split = [0.25, 0.35, 0.1, 0.3];
  const mealDefs = [
    {
      name: "Breakfast",
      time: "7:30 AM",
      items: ["Greek yogurt with berries", "Oats", "Whole eggs", "Black coffee"],
    },
    {
      name: "Lunch",
      time: "12:30 PM",
      items: [
        "Grilled chicken breast",
        "Brown rice or quinoa",
        "Mixed greens",
        "Olive oil dressing",
      ],
    },
    {
      name: "Snack",
      time: "4:00 PM",
      items: ["Protein shake", "Apple or banana", "Handful of almonds"],
    },
    {
      name: "Dinner",
      time: "7:30 PM",
      items: ["Salmon or lean beef", "Roasted sweet potato", "Steamed vegetables"],
    },
  ];

  const meals = mealDefs.map((m, i) => ({
    name: m.name,
    time: m.time,
    items: m.items,
    calories: Math.round(t.calories * split[i]),
    protein_g: Math.round(t.proteinG * split[i]),
  }));

  return {
    summary: `${t.calories} kcal/day for ${goal} (maintenance ≈ ${t.maintenance} kcal). High-protein, whole-food template.`,
    daily_calories: t.calories,
    macros: { protein_g: t.proteinG, carbs_g: t.carbsG, fat_g: t.fatG },
    meals,
    hydration: `Aim for ${(profile.weightKg * 0.035).toFixed(1)} L of water daily, more on training days.`,
    notes:
      profile.goal === "weight_loss"
        ? "Calories are set ~20% below maintenance for steady fat loss (~0.5 kg/week). Keep protein high to preserve muscle."
        : profile.goal === "muscle_gain"
          ? "A modest ~10% surplus supports lean gains while limiting fat. Adjust up if weight stalls for 2+ weeks."
          : "Calories near maintenance — track weekly bodyweight and adjust by ±150 kcal as needed.",
    _engine: "rule-based",
  };
}

export function generateRecoveryPlan(profile, recovery) {
  const score = recovery?.readiness ?? readinessScore(recovery || {});
  const band = readinessBand(score);
  const age = profile.age || 30;
  const hrv = recovery?.hrv ?? 55;
  const soreness = recovery?.soreness ?? 3;
  const stress = recovery?.stress ?? 3;
  const flags = impairmentFlags(profile);

  // Estimated hours until ready for an intense session.
  let hours = band === "peak" ? 0 : band === "ready" ? 12 : band === "moderate" ? 24 : 48;
  if (age > 40) hours += 12;
  if (age > 55) hours += 12;
  if (hrv < 45) hours += 12;
  if (profile.weightKg > 100) hours += 6;

  const status =
    band === "low"
      ? "Full rest recommended"
      : band === "moderate"
        ? "Active recovery day"
        : band === "peak"
          ? "Fully recovered — ready to perform"
          : "Recovered — light recovery only";

  const sleepTarget = age > 45 || band === "low" ? 9 : 8;

  const focus = [];
  if (band === "low" || soreness >= 4) focus.push("Tissue recovery & rest");
  if (stress >= 4) focus.push("Stress & nervous-system downregulation");
  if (hrv < 45) focus.push("Parasympathetic recovery (low HRV)");
  if (age > 45) focus.push("Joint mobility & longevity");
  if (flags.any) focus.push(`Care for ${flags.raw.join(", ")}`);
  if (focus.length === 0) focus.push("Light mobility & maintenance");

  const recommendations = [];
  if (band === "low") {
    recommendations.push({
      title: "Take a full rest day",
      detail:
        "Your body is under-recovered. Skip resistance training today — a 20-30 min easy walk is the most you should do.",
    });
  } else if (band === "moderate") {
    recommendations.push({
      title: "Active recovery",
      detail:
        "20-40 min of low-intensity cardio (walk, easy cycle, swim) plus 10-15 min of full-body mobility. Keep heart rate under 60% max.",
    });
  } else {
    recommendations.push({
      title: "Light mobility",
      detail:
        "10-15 min of dynamic mobility and foam rolling is enough — you're cleared to train hard when planned.",
    });
  }
  recommendations.push({
    title: `Prioritise ${sleepTarget}h sleep`,
    detail: `Sleep is your #1 recovery tool. Aim for ${sleepTarget} hours tonight; keep a consistent schedule and a cool, dark room.`,
  });
  if (soreness >= 3)
    recommendations.push({
      title: "Address soreness",
      detail:
        "Foam roll sore muscles for 1-2 min each, gentle stretching, and consider contrast showers or a warm bath.",
    });
  if (stress >= 3)
    recommendations.push({
      title: "Lower stress load",
      detail:
        "10 min of slow nasal breathing (4s in / 6s out) or a short meditation to shift into parasympathetic recovery.",
    });
  if (hrv < 45)
    recommendations.push({
      title: "Rebuild HRV",
      detail:
        "Low HRV signals fatigue. Avoid intense training, caffeine late in the day, and alcohol until it trends back up.",
    });
  if (age > 45)
    recommendations.push({
      title: "Joint care",
      detail:
        "Add 5-10 min of targeted mobility for hips, shoulders, and ankles to protect joints and aid recovery.",
    });

  return {
    summary: `Recovery plan for a ${age}-year-old at ${score}/100 readiness (${band}, HRV ${hrv}ms). ${status}.`,
    recovery_status: status,
    estimated_recovery_hours: hours,
    sleep_target_hours: sleepTarget,
    focus_areas: focus,
    recommendations,
    hydration_nutrition: `Drink ${(profile.weightKg * 0.04).toFixed(1)} L water today, get ~${Math.round(profile.weightKg * (profile.goal === "muscle_gain" ? 2 : 1.8))}g protein to repair muscle, and include anti-inflammatory foods (berries, fatty fish, leafy greens).`,
    _engine: "rule-based",
  };
}

export function coachReply(profile, messages) {
  const last = (messages[messages.length - 1]?.content || "").toLowerCase();
  const t = nutritionTargets(profile);
  const name = profile.name || "there";

  if (/protein/.test(last)) {
    return `Based on your stats, aim for about ${t.proteinG}g of protein per day, ${name}. Spread it across your meals (~${Math.round(t.proteinG / 4)}g each) and prioritise it post-workout. Lean meats, eggs, dairy, legumes, and a shake make it easy to hit.`;
  }
  if (/calorie|how much.*eat|deficit|surplus/.test(last)) {
    return `Your maintenance is roughly ${t.maintenance} kcal/day. For your goal I'd target ${t.calories} kcal/day. Track for two weeks and adjust by ±150 kcal based on the scale trend.`;
  }
  if (/sore|recover|rest|tired|readiness/.test(last)) {
    return `Soreness and low readiness are signals, not obstacles. If your readiness score is under 50, take an active recovery day — a walk, mobility work, and 8h of sleep will do more than grinding a hard session. Your workout plan already auto-deloads when readiness drops.`;
  }
  if (/lose|fat|weight loss|cut/.test(last)) {
    return `Sustainable fat loss comes from a modest calorie deficit (≈${Math.round(t.maintenance * 0.8)} kcal for you), high protein, resistance training to keep muscle, and daily steps. Aim for ~0.5 kg/week — faster than that and you'll lose muscle too.`;
  }
  return `Good question, ${name}. The fundamentals that drive 90% of results: train hard 3-5x/week, hit ~${t.proteinG}g protein and ~${t.calories} kcal daily for your goal, sleep 7-9h, and stay consistent for months not days. Ask me about your workout plan, nutrition numbers, recovery, or any exercise and I'll get specific. (The full AI coach is busy right now — ask again in a little while for a personalised reply.)`;
}
