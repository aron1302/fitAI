import { describe, it, expect } from "vitest";
import {
  normalizeExercise,
  findExerciseKey,
  getDaySets,
  exerciseSessions,
  mergeWorkoutLogs,
} from "../client/src/lib/workoutLog.js";

const set = (weight, reps) => ({ weight, reps });

describe("normalizeExercise", () => {
  it("ignores case and extra whitespace", () => {
    expect(normalizeExercise("  Preacher   Curls ")).toBe("preacher curls");
    expect(normalizeExercise("Preacher curls")).toBe(normalizeExercise("PREACHER CURLS"));
  });

  it("keeps genuinely different names distinct", () => {
    expect(normalizeExercise("Preacher Curls")).not.toBe(normalizeExercise("Hammer Curls"));
    expect(normalizeExercise("Preacher Curls (2)")).not.toBe(normalizeExercise("Preacher Curls"));
  });

  it("tolerates missing input", () => {
    expect(normalizeExercise(null)).toBe("");
    expect(normalizeExercise(undefined)).toBe("");
  });
});

describe("findExerciseKey", () => {
  const dayLog = { "Preacher Curls": [set(30, 10)], Skullcrushers: [set(25, 12)] };

  it("prefers the exact key", () => {
    expect(findExerciseKey(dayLog, "Preacher Curls")).toBe("Preacher Curls");
  });

  it("falls back to a case/whitespace variant", () => {
    expect(findExerciseKey(dayLog, "preacher  curls")).toBe("Preacher Curls");
  });

  it("returns null when the exercise was never logged that day", () => {
    expect(findExerciseKey(dayLog, "Hammer Curls")).toBe(null);
    expect(findExerciseKey(undefined, "Preacher Curls")).toBe(null);
  });
});

describe("getDaySets / exerciseSessions", () => {
  // The same exercise logged under three spellings across three days — the
  // exact situation a regenerated or coach-edited plan produces.
  const log = {
    "2026-07-01": { "Preacher Curls": [set(25, 10), set(25, 8)] },
    "2026-07-05": { "PREACHER CURLS ": [set(27.5, 10)] },
    "2026-07-07": { "Preacher curls": [set(30, 10)], Skullcrushers: [set(25, 12)] },
  };

  it("finds a day's sets regardless of stored spelling", () => {
    expect(getDaySets(log, "2026-07-05", "Preacher curls")).toEqual([set(27.5, 10)]);
    expect(getDaySets(log, "2026-07-04", "Preacher curls")).toEqual([]);
  });

  it("threads every spelling into one history, oldest first", () => {
    const sessions = exerciseSessions(log, "Preacher curls");
    expect(sessions.map((s) => s.date)).toEqual(["2026-07-01", "2026-07-05", "2026-07-07"]);
    expect(sessions[1].sets).toEqual([set(27.5, 10)]);
  });

  it("does not mix in other exercises", () => {
    expect(exerciseSessions(log, "Skullcrushers")).toHaveLength(1);
    expect(exerciseSessions(log, "Hammer Curls")).toHaveLength(0);
    expect(exerciseSessions(undefined, "Preacher curls")).toEqual([]);
  });
});

describe("mergeWorkoutLogs", () => {
  it("keeps local sessions the server never received", () => {
    const server = { "2026-07-01": { Squat: [set(100, 5)] } };
    const local = {
      "2026-07-01": { Squat: [set(100, 5)] },
      "2026-07-05": { "Preacher Curls": [set(27.5, 10)] }, // failed to sync
    };
    expect(mergeWorkoutLogs(server, local)).toEqual({
      "2026-07-01": { Squat: [set(100, 5)] },
      "2026-07-05": { "Preacher Curls": [set(27.5, 10)] },
    });
  });

  it("keeps server sessions this device has never seen", () => {
    const server = { "2026-07-03": { Deadlift: [set(140, 3)] } };
    const local = { "2026-07-05": { Squat: [set(100, 5)] } };
    const merged = mergeWorkoutLogs(server, local);
    expect(Object.keys(merged).sort()).toEqual(["2026-07-03", "2026-07-05"]);
  });

  it("unions exercises within a day, local winning per exercise", () => {
    const server = {
      "2026-07-05": { Squat: [set(100, 5)], "Leg Press": [set(180, 10)] },
    };
    const local = {
      // Local removed a squat set (deliberate edit) and added lunges offline.
      "2026-07-05": { Squat: [set(100, 5), set(105, 3)], Lunges: [set(20, 12)] },
    };
    expect(mergeWorkoutLogs(server, local)["2026-07-05"]).toEqual({
      Squat: [set(100, 5), set(105, 3)],
      "Leg Press": [set(180, 10)],
      Lunges: [set(20, 12)],
    });
  });

  it("collapses case variants of one exercise to the local spelling", () => {
    const server = { "2026-07-05": { "PREACHER CURLS": [set(25, 10)] } };
    const local = { "2026-07-05": { "Preacher curls": [set(27.5, 10)] } };
    expect(mergeWorkoutLogs(server, local)["2026-07-05"]).toEqual({
      "Preacher curls": [set(27.5, 10)],
    });
  });

  it("handles empty or missing sides", () => {
    const only = { "2026-07-05": { Squat: [set(100, 5)] } };
    expect(mergeWorkoutLogs(undefined, only)).toEqual(only);
    expect(mergeWorkoutLogs(only, undefined)).toEqual(only);
    expect(mergeWorkoutLogs(undefined, undefined)).toEqual({});
  });
});
