// Personalised flexibility & mobility guidance from the user's profile and
// recovery — a targeted routine, focus areas, and age-aware cautions, with
// extra emphasis on joint health and balance for the 50+ group.
// Pure functions, no dependencies; easy to test and run offline.

import { readinessScore, readinessBand } from "./calc.js";

// Library of mobility/stretch drills keyed by the body area they target.
const DRILLS = {
  spine: {
    name: "Cat–cow & open-book rotations",
    target: "Thoracic & lower back",
    type: "Mobility",
    detail: "Keeps the spine supple and eases stiffness from sitting.",
  },
  hips: {
    name: "90/90 hip switches + hip-flexor stretch",
    target: "Hips",
    type: "Mobility",
    detail: "Opens tight hips and counteracts long periods of sitting.",
  },
  shoulders: {
    name: "Wall slides & band pass-throughs",
    target: "Shoulders",
    type: "Mobility",
    detail: "Restores healthy overhead range and protects the rotator cuff.",
  },
  hamstrings: {
    name: "Standing / seated hamstring stretch",
    target: "Hamstrings",
    type: "Static",
    detail: "Improves posture and takes strain off the lower back.",
  },
  ankles: {
    name: "Knee-to-wall ankle rocks & calf stretch",
    target: "Ankles & calves",
    type: "Mobility",
    detail: "Better ankle range aids balance, walking, and squatting.",
  },
  neck: {
    name: "Slow neck rotations & upper-trap stretch",
    target: "Neck",
    type: "Static",
    detail: "Releases tension built up from screens and desk work.",
  },
  balance: {
    name: "Single-leg balance hold",
    target: "Balance & stability",
    type: "Balance",
    detail: "Hold 20–30s per leg (use a wall for support) — key for fall prevention as you age.",
  },
};

function impairmentFlags(profile) {
  const text = (profile.impairments || []).join(" ").toLowerCase();
  return {
    knee: /knee|acl|meniscus|patell/.test(text),
    back: /back|spine|disc|lumbar|sciatic/.test(text),
    shoulder: /shoulder|rotator|cuff/.test(text),
    any: (profile.impairments || []).length > 0,
  };
}

export function flexibilitySuggestions(profile, recovery = {}) {
  const age = profile.age || 30;
  const senior = age >= 50;
  const readiness = recovery.readiness ?? readinessScore(recovery);
  const band = readinessBand(readiness);
  const soreness = recovery.soreness ?? 3;
  const flags = impairmentFlags(profile);

  // Core focus areas for everyone, plus targeted additions.
  const areas = ["spine", "hips", "shoulders", "hamstrings", "ankles"];
  if (senior) {
    if (!areas.includes("neck")) areas.push("neck");
    areas.push("balance"); // balance work matters most with age
  }
  if (flags.shoulder && !areas.includes("shoulders")) areas.push("shoulders");

  // Longer holds and daily practice for older trainees; gentler when very sore.
  const gentle = soreness >= 4 || band === "low";
  const holdSec = senior ? (gentle ? 30 : 40) : gentle ? 20 : 30;

  const routine = areas.map((key) => {
    const d = DRILLS[key];
    const prescription =
      d.type === "Static"
        ? `Hold ${holdSec}s × 2 each side`
        : d.type === "Balance"
          ? "20–30s × 2 each leg"
          : `8–10 slow reps × 2`;
    return { ...d, area: key, prescription };
  });

  const frequency = senior
    ? "Daily — 10–15 minutes"
    : gentle
      ? "Gentle, daily until soreness eases"
      : "4–5× per week — 8–10 minutes";

  const cautions = ["Stretch to mild tension — never to pain, and never bounce."];
  if (gentle)
    cautions.push("You're sore / under-recovered today — keep this restorative and easy, and add light foam rolling.");
  if (flags.back)
    cautions.push("Go gently on spinal rotations and forward folds; stop anything that sends pain down your leg.");
  if (flags.knee) cautions.push("Avoid deep knee flexion in stretches; keep ranges pain-free.");
  if (senior) {
    cautions.push("Move slowly and use a wall or chair for support during balance work.");
    cautions.push("Warm the muscles first (a short walk) — cold static stretching is less effective and riskier.");
  }

  const ageGuidance = senior
    ? "After 50, daily mobility does more than improve comfort — it preserves joint range, posture, balance, and independence. Hold static stretches a little longer (30–45s), never force a range, and include the balance drill to reduce fall risk."
    : null;

  return {
    summary: `A ${routine.length}-part mobility routine targeting your key areas, ${gentle ? "kept gentle for recovery today" : "for everyday suppleness and joint health"}.`,
    senior,
    age,
    readiness,
    band,
    soreness,
    frequency,
    focusAreas: routine.map((r) => r.target),
    routine,
    ageGuidance,
    cautions,
  };
}
