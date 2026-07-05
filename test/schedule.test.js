import { describe, it, expect } from "vitest";
import { workoutSchedule, workoutForDate, defaultTrainingDays } from "../client/src/lib/calc.js";

const plan3 = { days: [{ day: "Full Body A" }, { day: "Full Body B" }, { day: "Full Body C" }] };
const plan4 = {
  days: [{ day: "Upper" }, { day: "Lower" }, { day: "Push" }, { day: "Pull" }],
};

describe("workoutSchedule", () => {
  it("returns an empty map when there is no plan", () => {
    expect(workoutSchedule(null)).toEqual({});
    expect(workoutSchedule({ days: [] })).toEqual({});
  });

  it("spreads 3 training days onto Mon/Wed/Fri with rest days between", () => {
    const s = workoutSchedule(plan3);
    expect(s[1].day).toBe("Full Body A"); // Monday
    expect(s[3].day).toBe("Full Body B"); // Wednesday
    expect(s[5].day).toBe("Full Body C"); // Friday
    expect(s[0]).toBeUndefined(); // Sunday — rest
    expect(s[2]).toBeUndefined(); // Tuesday — rest
    expect(s[6]).toBeUndefined(); // Saturday — rest
  });

  it("spreads 4 training days onto Mon/Tue/Thu/Fri", () => {
    const s = workoutSchedule(plan4);
    expect(s[1].day).toBe("Upper");
    expect(s[2].day).toBe("Lower");
    expect(s[4].day).toBe("Push");
    expect(s[5].day).toBe("Pull");
    expect(s[3]).toBeUndefined(); // Wednesday — rest
  });

  it("honours user-chosen training days, assigning workouts in calendar order", () => {
    // User picks Tue(2), Thu(4), Sat(6) — workouts map in week order.
    const s = workoutSchedule(plan3, [4, 6, 2]); // unsorted input
    expect(s[2].day).toBe("Full Body A"); // Tuesday first
    expect(s[4].day).toBe("Full Body B"); // Thursday
    expect(s[6].day).toBe("Full Body C"); // Saturday
    expect(s[1]).toBeUndefined(); // Monday — not selected
  });

  it("treats Sunday as the last day of the week when ordering", () => {
    const s = workoutSchedule(plan3, [0, 1, 3]); // Sun, Mon, Wed
    expect(s[1].day).toBe("Full Body A"); // Monday first
    expect(s[3].day).toBe("Full Body B"); // Wednesday
    expect(s[0].day).toBe("Full Body C"); // Sunday last
  });
});

describe("defaultTrainingDays", () => {
  it("returns a Monday-first spread sized to the day count", () => {
    expect(defaultTrainingDays(3)).toEqual([1, 3, 5]);
    expect(defaultTrainingDays(4)).toEqual([1, 2, 4, 5]);
  });
});

describe("workoutForDate", () => {
  it("returns the scheduled day for a training weekday", () => {
    const monday = new Date(2024, 0, 1); // 2024-01-01 is a Monday
    expect(monday.getDay()).toBe(1); // sanity check
    expect(workoutForDate(plan3, monday).day).toBe("Full Body A");
  });

  it("returns null on a rest day", () => {
    const sunday = new Date(2023, 11, 31); // 2023-12-31 is a Sunday
    expect(sunday.getDay()).toBe(0); // sanity check
    expect(workoutForDate(plan3, sunday)).toBe(null);
  });

  it("returns null when there is no plan", () => {
    expect(workoutForDate(null, new Date())).toBe(null);
  });
});

describe("weeklyExtras (cardio / flexibility / recovery scheduling)", () => {
  const plan3 = { days: [{ day: "A" }, { day: "B" }, { day: "C" }] };
  const plan4 = { days: [{ day: "A" }, { day: "B" }, { day: "C" }, { day: "D" }] };
  const base = { age: 30, goal: "recomp", daysPerWeek: 3 };

  it("fills rest days: cardio first, recovery on the week's last free day", async () => {
    const { weeklyExtras } = await import("../client/src/lib/calc.js");
    // 3-day plan → Mon/Wed/Fri training; rest = Tue/Thu/Sat/Sun.
    const x = weeklyExtras(base, plan3);
    expect(x[2].type).toBe("cardio"); // Tuesday
    expect(x[4].type).toBe("cardio"); // Thursday
    expect(x[6].type).toBe("flexibility"); // Saturday
    expect(x[0].type).toBe("recovery"); // Sunday
    expect(x[1]).toBeUndefined(); // training days carry no extra
  });

  it("gives endurance goals more cardio and muscle gain less", async () => {
    const { weeklyExtras } = await import("../client/src/lib/calc.js");
    const endu = weeklyExtras({ ...base, goal: "endurance" }, plan3);
    expect([2, 4, 6].every((wd) => endu[wd].type === "cardio")).toBe(true);
    expect(endu[2].duration_min).toBe(45);
    const gain = weeklyExtras({ ...base, goal: "muscle_gain" }, plan3);
    expect([2, 4, 6, 0].filter((wd) => gain[wd]?.type === "cardio")).toHaveLength(1);
    expect(gain[2].duration_min).toBe(20);
  });

  it("adapts to age: shorter low-impact cardio and more mobility for 50+", async () => {
    const { weeklyExtras } = await import("../client/src/lib/calc.js");
    const x = weeklyExtras({ ...base, age: 58 }, plan3);
    expect(x[2].duration_min).toBe(30);
    expect(x[2].detail).toMatch(/low-impact/i);
    expect(x[6].title).toMatch(/balance/i);
  });

  it("rides flexibility along the last lift when no free day remains", async () => {
    const { weeklyExtras } = await import("../client/src/lib/calc.js");
    // 4-day plan → Mon/Tue/Thu/Fri training; rest = Wed/Sat/Sun; two cardio
    // days + recovery consume all three, so flexibility lands on Friday.
    const x = weeklyExtras(base, plan4);
    expect(x[3].type).toBe("cardio");
    expect(x[6].type).toBe("cardio");
    expect(x[0].type).toBe("recovery");
    expect(x[5].type).toBe("flexibility");
    expect(x[5].withWorkout).toBe(true);
  });

  it("keeps the single free day as recovery on a 6-day split", async () => {
    const { weeklyExtras } = await import("../client/src/lib/calc.js");
    const plan6 = { days: Array.from({ length: 6 }, (_, i) => ({ day: `D${i}` })) };
    const x = weeklyExtras({ ...base, daysPerWeek: 6 }, plan6);
    expect(x[0].type).toBe("recovery"); // Sunday
    // No cardio squeezed in — recovery keeps its day.
    expect(Object.values(x).filter((e) => e.type === "cardio")).toHaveLength(0);
  });
});
