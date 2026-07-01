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
