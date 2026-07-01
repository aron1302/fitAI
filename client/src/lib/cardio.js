// Personalised cardio guidance derived from the user's profile and recovery:
// heart-rate training zones (Karvonen / heart-rate-reserve method), a weekly
// session plan, and age-aware cautions — with extra care for the 50+ group.
// Pure functions, no dependencies, so they run offline and are easy to test.

import { readinessScore, readinessBand } from "./calc.js";

const ZONE_DEFS = [
  { z: 1, name: "Recovery", lo: 0.5, hi: 0.6, purpose: "Easy active recovery, warm-up & cool-down" },
  {
    z: 2,
    name: "Aerobic base",
    lo: 0.6,
    hi: 0.7,
    purpose: "Conversational pace — builds endurance & burns fat",
  },
  { z: 3, name: "Tempo", lo: 0.7, hi: 0.8, purpose: "Comfortably hard — lifts aerobic capacity" },
  { z: 4, name: "Threshold", lo: 0.8, hi: 0.9, purpose: "Hard — raises your lactate threshold" },
  { z: 5, name: "VO₂ max", lo: 0.9, hi: 1.0, purpose: "Very hard intervals — peak power & VO₂ max" },
];

// Max HR (Tanaka) + heart-rate-reserve zones using resting HR.
export function heartRateZones(profile, recovery = {}) {
  const age = profile.age || 30;
  const restingHr = recovery.restingHr ?? profile.restingHr ?? 60;
  const hrMax = Math.round(208 - 0.7 * age);
  const hrr = hrMax - restingHr;
  const at = (pct) => Math.round(restingHr + pct * hrr);
  return {
    hrMax,
    restingHr,
    zones: ZONE_DEFS.map((d) => ({
      z: d.z,
      name: d.name,
      low: at(d.lo),
      high: at(d.hi),
      purpose: d.purpose,
    })),
  };
}

const LOW_IMPACT = ["Brisk walking", "Stationary cycling", "Swimming", "Elliptical", "Rowing"];
const HIGHER_IMPACT = ["Jogging / running", "Stair climbing", "Hill walking"];

function impairmentFlags(profile) {
  const text = (profile.impairments || []).join(" ").toLowerCase();
  return {
    knee: /knee|acl|meniscus|patell/.test(text),
    back: /back|spine|disc|lumbar|sciatic/.test(text),
    any: (profile.impairments || []).length > 0,
  };
}

export function cardioSuggestions(profile, recovery = {}) {
  const age = profile.age || 30;
  const senior = age >= 50;
  const readiness = recovery.readiness ?? readinessScore(recovery);
  const band = readinessBand(readiness);
  const goal = profile.goal || "maintain";
  const flags = impairmentFlags(profile);
  const hr = heartRateZones(profile, recovery);
  const restingHr = hr.restingHr;

  // Prefer joint-friendly modalities for older trainees or knee/back issues.
  const lowImpactOnly = senior || flags.knee || flags.back;
  const modalities = lowImpactOnly ? LOW_IMPACT : [...LOW_IMPACT, ...HIGHER_IMPACT];
  const pick = (i) => modalities[i % modalities.length];

  // Cap intensity when under-recovered, and a touch lower for the 50+ group.
  const maxZone = band === "low" ? 2 : band === "moderate" ? 3 : senior ? 4 : 5;

  const sessions = [];
  if (band === "low") {
    sessions.push({
      title: "Easy recovery cardio",
      type: pick(0),
      zone: 1,
      duration_min: senior ? 20 : 25,
      detail:
        "Your readiness is low today — keep it gentle and conversational. This is about blood flow and recovery, not training stress.",
    });
  } else {
    const baseCount =
      goal === "endurance" ? 3 : goal === "weight_loss" ? 2 : goal === "muscle_gain" ? 1 : 2;
    for (let i = 0; i < baseCount; i++) {
      sessions.push({
        title: "Zone 2 aerobic base",
        type: pick(i),
        zone: 2,
        duration_min: senior ? 30 : goal === "endurance" ? 45 : 35,
        detail:
          "Steady, conversational effort (you can still talk). This is the foundation of heart health and endurance.",
      });
    }
    if (maxZone >= 3 && goal !== "muscle_gain") {
      const z = Math.min(maxZone, goal === "endurance" ? 4 : 3);
      sessions.push({
        title: senior ? "Gentle intervals" : "Interval session",
        type: lowImpactOnly ? "Cycling or elliptical" : pick(1),
        zone: z,
        duration_min: senior ? 25 : 30,
        detail: senior
          ? "After a thorough warm-up, alternate 1–2 min of slightly harder effort with 2–3 min easy. Ease off if you feel breathless or light-headed."
          : `After warming up, alternate hard efforts in Zone ${z} with easy recovery. Time-efficient way to boost fitness.`,
      });
    } else if (goal === "muscle_gain") {
      sessions.push({
        title: "Optional easy cardio",
        type: pick(2),
        zone: 2,
        duration_min: 20,
        detail:
          "Keep cardio light and brief so it supports recovery without eating into your strength gains.",
      });
    }
  }

  const weeklyMinutes = senior ? 150 : goal === "endurance" ? 240 : 180;
  const stepGoal = senior ? 8000 : 10000;

  const cautions = ["Warm up for 5–10 minutes before, and cool down after, every session."];
  if (band === "low") cautions.push("Readiness is low — stay in Zone 1–2 and skip hard efforts today.");
  if (restingHr >= 70)
    cautions.push("Your resting heart rate is a little high — consistent Zone 2 work will help bring it down.");
  if (lowImpactOnly)
    cautions.push("Sticking to low-impact options to protect your joints — swap in a walk or cycle for any running.");
  if (senior) {
    cautions.push("Progress volume gradually (no more than ~10% more per week) and listen to your body.");
    cautions.push(
      "If you have a heart condition, are on medication, or haven't exercised in a while, check with your doctor before vigorous cardio."
    );
  }

  const ageGuidance = senior
    ? "After 50, regular cardio is one of the strongest protectors of heart, brain, and metabolic health. Favour low-impact activities, aim for the WHO target of ~150 minutes of moderate aerobic activity per week, and treat brisk daily walking as the backbone of your routine."
    : null;

  return {
    summary: `${sessions.length} cardio session${sessions.length === 1 ? "" : "s"} this week, tuned to your ${band} readiness and ${goal.replace("_", " ")} goal.`,
    senior,
    age,
    readiness,
    band,
    goal,
    hrMax: hr.hrMax,
    restingHr,
    zones: hr.zones,
    maxZone,
    weeklyMinutes,
    stepGoal,
    sessions,
    ageGuidance,
    cautions,
  };
}
