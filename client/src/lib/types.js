// Shared JSDoc type definitions for the app's core data shapes.
//
// These mirror the Zod schemas in server/lib/schemas.js, which remain the
// runtime source of truth (they actually validate the data). Keeping these as
// JSDoc gives editor autocomplete and red-squiggle checking across the JS
// codebase without a TypeScript build step. If you change a schema, update the
// matching typedef here.

/**
 * @typedef {Object} Profile
 * @property {string} [name]
 * @property {number} [age]
 * @property {"male"|"female"} [sex]
 * @property {number} [heightCm]
 * @property {number} [weightKg]
 * @property {"weight_loss"|"muscle_gain"|"recomp"|"maintain"|"endurance"} [goal]
 * @property {string} [activityLevel]
 * @property {number} [daysPerWeek]
 * @property {string} [experience]
 * @property {string[]} [impairments]
 * @property {number[]} [trainingDays] - JS weekday numbers (0=Sun…6=Sat) the user trains
 * @property {boolean} [onboarded]
 */

/**
 * @typedef {Object} Recovery
 * @property {number} [sleepHours]
 * @property {number} [restingHr]
 * @property {number} [hrv]
 * @property {number} [soreness]
 * @property {number} [stress]
 * @property {number} [hoursSinceWorkout]
 * @property {number} [readiness]
 */

/**
 * @typedef {Object} Meal
 * @property {string} name
 * @property {string} [time]
 * @property {string[]} items
 * @property {number} [calories]
 * @property {number} [protein_g]
 */

/**
 * @typedef {Object} Macros
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 */

/**
 * @typedef {Object} DietPlan
 * @property {string} [summary]
 * @property {number} daily_calories
 * @property {Macros} macros
 * @property {Meal[]} meals
 * @property {string} [hydration]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} Exercise
 * @property {string} name
 * @property {number|string} [sets]
 * @property {number|string} [reps]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} WorkoutDay
 * @property {string} day
 * @property {string} [focus]
 * @property {string} [intensity]
 * @property {number} [duration_min]
 * @property {Exercise[]} exercises
 */

/**
 * @typedef {Object} WorkoutPlan
 * @property {string} [summary]
 * @property {string} [weekly_focus]
 * @property {WorkoutDay[]} days
 * @property {string} [readiness_guidance]
 * @property {string} [cautions]
 */

/**
 * @typedef {Object} User
 * @property {number} id
 * @property {string} email
 */

export {};
