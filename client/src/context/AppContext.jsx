import { createContext, useContext, useEffect, useRef, useState } from "react";
import { readinessScore } from "../lib/calc.js";
import {
  fetchState,
  saveState,
  fetchWorkoutPlan,
  fetchDietPlan,
  fetchRecoveryPlan,
  coachAct,
  streamCoach,
  fetchTrackers,
  fetchActivity,
  syncFitbit,
} from "../lib/api.js";

// Opening message from the AI coach.
const coachGreeting = (name) =>
  `Hi${name ? ` ${name}` : ""}! I'm your AI fitness coach. I know your goal, stats, and today's readiness — ask me anything about training, nutrition, or recovery.`;

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const PROFILE_KEY = "fitai.profile";
const RECOVERY_KEY = "fitai.recovery";
const LOG_KEY = "fitai.log";
const WORKOUT_PLAN_KEY = "fitai.workoutPlan";
const DIET_PLAN_KEY = "fitai.dietPlan";
const RECOVERY_PLAN_KEY = "fitai.recoveryPlan";
const HISTORY_KEY = "fitai.history";
const MEAL_LOG_KEY = "fitai.mealLog";
const WORKOUT_LOG_KEY = "fitai.workoutLog";
const CALENDAR_KEY = "fitai.calendar";

// Short unique id for a user-added calendar activity.
const newId = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Local date key (YYYY-MM-DD) for the given date, defaulting to today.
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DEFAULT_PROFILE = {
  name: "",
  age: 30,
  sex: "male",
  heightCm: 178,
  weightKg: 80,
  goal: "recomp",
  activityLevel: "moderate",
  daysPerWeek: 4,
  experience: "intermediate",
  impairments: [],
  onboarded: false,
};

const DEFAULT_RECOVERY = {
  sleepHours: 7.5,
  restingHr: 58,
  hrv: 60,
  soreness: 2,
  stress: 2,
  hoursSinceWorkout: 24,
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }) {
  const [profile, setProfile] = useState(() => load(PROFILE_KEY, DEFAULT_PROFILE));
  const [recovery, setRecovery] = useState(() => load(RECOVERY_KEY, DEFAULT_RECOVERY));
  const [log, setLog] = useState(() => load(LOG_KEY, {}));
  // Generated plans persist so they survive navigation and reloads.
  const [workoutPlan, setWorkoutPlan] = useState(() => load(WORKOUT_PLAN_KEY, null));
  const [dietPlan, setDietPlan] = useState(() => load(DIET_PLAN_KEY, null));
  const [recoveryPlan, setRecoveryPlan] = useState(() => load(RECOVERY_PLAN_KEY, null));
  // Per-day archive of the plans that were active on each date, so the
  // Calendar page can show what workout & meals you were using back then.
  const [history, setHistory] = useState(() => load(HISTORY_KEY, {}));
  // Which meals the user has checked off as eaten, keyed by date then meal name.
  const [mealLog, setMealLog] = useState(() => load(MEAL_LOG_KEY, {}));
  // Logged training sets, keyed by date then exercise name; each value is an
  // array of { weight, reps } the user actually performed, for progress tracking.
  const [workoutLog, setWorkoutLog] = useState(() => load(WORKOUT_LOG_KEY, {}));
  // User-added calendar entries, keyed by date: { activities: [{id,type,title}],
  // hideWorkout: bool }. Lets the user add a run/mobility session to any day and
  // remove a scheduled workout for a specific date.
  const [calendar, setCalendar] = useState(() => load(CALENDAR_KEY, {}));

  // The AI coach conversation and plan-generation status live here, above the
  // router, so an in-flight reply or "Generate" keeps running when the user
  // navigates to another page and back — instead of resetting on remount.
  const [coachMessages, setCoachMessages] = useState(() => [
    { role: "assistant", content: coachGreeting(profile.name) },
  ]);
  const [coachBusy, setCoachBusy] = useState(false);
  const [genState, setGenState] = useState({
    workout: { loading: false, error: null },
    diet: { loading: false, error: null },
    recovery: { loading: false, error: null },
  });

  // Tracker connections + today's synced activity (steps/calories from a real
  // device). `activity` is null until a tracker has synced for today; the
  // dashboard falls back to the built-in estimate in that case.
  const [trackers, setTrackers] = useState(null);
  const [activity, setActivity] = useState(null);

  // On boot: load connection status, then either pull a fresh sync from the
  // connected tracker or fall back to the last stored value for today.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await fetchTrackers();
      if (cancelled) return;
      setTrackers(t?.providers || null);
      const today = dateKey();
      if (t?.providers?.fitbit?.connected) {
        try {
          const row = await syncFitbit(today);
          if (!cancelled) setActivity(row);
          return;
        } catch {
          // network/provider hiccup — fall through to the stored value
        }
      }
      const row = await fetchActivity(today);
      if (!cancelled) setActivity(row);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read connection status (used by the devices panel after connect/disconnect).
  const refreshTrackers = async () => {
    const t = await fetchTrackers();
    setTrackers(t?.providers || null);
    return t?.providers || null;
  };

  // Manual "Sync now" for today's numbers.
  const syncActivity = async () => {
    const row = await syncFitbit(dateKey());
    setActivity(row);
    return row;
  };

  // The server is the source of truth; localStorage is only an instant-load
  // cache / offline fallback. `hydrated` gates server writes so the initial
  // cached values don't overwrite freshly-loaded server data on boot.
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchState().then((s) => {
      if (cancelled) return;
      if (s) {
        if (s.profile) setProfile((p) => ({ ...p, ...s.profile }));
        if (s.recovery) setRecovery((r) => ({ ...r, ...s.recovery }));
        if (s.log) setLog(s.log);
        if (s.workoutPlan) setWorkoutPlan(s.workoutPlan);
        if (s.dietPlan) setDietPlan(s.dietPlan);
        if (s.recoveryPlan) setRecoveryPlan(s.recoveryPlan);
        if (s.history) setHistory(s.history);
        if (s.mealLog) setMealLog(s.mealLog);
        if (s.workoutLog) setWorkoutLog(s.workoutLog);
        if (s.calendar) setCalendar(s.calendar);
      }
      hydrated.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Write a value to the local cache always, and to the server once hydrated.
  const persist = (lsKey, serverKey, value) => {
    localStorage.setItem(lsKey, JSON.stringify(value));
    if (hydrated.current) saveState(serverKey, value);
  };

  useEffect(() => persist(PROFILE_KEY, "profile", profile), [profile]);
  useEffect(() => persist(RECOVERY_KEY, "recovery", recovery), [recovery]);
  useEffect(() => persist(LOG_KEY, "log", log), [log]);
  useEffect(() => {
    if (workoutPlan) persist(WORKOUT_PLAN_KEY, "workoutPlan", workoutPlan);
  }, [workoutPlan]);
  useEffect(() => {
    if (dietPlan) persist(DIET_PLAN_KEY, "dietPlan", dietPlan);
  }, [dietPlan]);
  useEffect(() => {
    if (recoveryPlan) persist(RECOVERY_PLAN_KEY, "recoveryPlan", recoveryPlan);
  }, [recoveryPlan]);
  useEffect(() => persist(HISTORY_KEY, "history", history), [history]);
  useEffect(() => persist(MEAL_LOG_KEY, "mealLog", mealLog), [mealLog]);
  useEffect(() => persist(WORKOUT_LOG_KEY, "workoutLog", workoutLog), [workoutLog]);
  useEffect(() => persist(CALENDAR_KEY, "calendar", calendar), [calendar]);

  // Toggle a meal as eaten/not-eaten for a given day (defaults to today).
  const toggleMealEaten = (mealName, day = dateKey()) =>
    setMealLog((m) => {
      const dayLog = { ...(m[day] || {}) };
      if (dayLog[mealName]) delete dayLog[mealName];
      else dayLog[mealName] = true;
      return { ...m, [day]: dayLog };
    });

  // Append a performed set ({ weight, reps }) for an exercise on a given day.
  const logSet = (exercise, set, day = dateKey()) =>
    setWorkoutLog((w) => {
      const dayLog = { ...(w[day] || {}) };
      dayLog[exercise] = [...(dayLog[exercise] || []), set];
      return { ...w, [day]: dayLog };
    });

  // Remove the set at `index` for an exercise on a given day.
  const removeSet = (exercise, index, day = dateKey()) =>
    setWorkoutLog((w) => {
      const dayLog = { ...(w[day] || {}) };
      const sets = (dayLog[exercise] || []).filter((_, i) => i !== index);
      if (sets.length) dayLog[exercise] = sets;
      else delete dayLog[exercise];
      return { ...w, [day]: dayLog };
    });

  // The most recent prior day (before `day`) on which this exercise was logged,
  // returned as { date, sets } — used to show last-session numbers for progress.
  const lastSession = (exercise, day = dateKey()) => {
    const dates = Object.keys(workoutLog)
      .filter((d) => d < day && workoutLog[d]?.[exercise]?.length)
      .sort()
      .reverse();
    return dates[0] ? { date: dates[0], sets: workoutLog[dates[0]][exercise] } : null;
  };

  // ---- User-added calendar activities & per-day workout removal ----
  const addActivity = (day, activity) =>
    setCalendar((c) => {
      const e = c[day] || { activities: [], hideWorkout: false };
      return {
        ...c,
        [day]: { ...e, activities: [...(e.activities || []), { id: newId(), ...activity }] },
      };
    });
  const removeActivity = (day, id) =>
    setCalendar((c) => {
      const e = c[day];
      if (!e) return c;
      return { ...c, [day]: { ...e, activities: (e.activities || []).filter((a) => a.id !== id) } };
    });
  // Hide (remove) or restore the auto-scheduled workout for a specific date.
  const setWorkoutHidden = (day, hidden) =>
    setCalendar((c) => {
      const e = c[day] || { activities: [], hideWorkout: false };
      return { ...c, [day]: { ...e, hideWorkout: hidden } };
    });

  // Snapshot today's active plans into the history archive whenever they
  // change. References are stable between renders, so this only writes when a
  // plan is actually (re)generated or edited.
  useEffect(() => {
    if (!workoutPlan && !dietPlan && !recoveryPlan) return;
    const key = dateKey();
    setHistory((h) => {
      const prev = h[key] || {};
      const workout = workoutPlan || prev.workout || null;
      const diet = dietPlan || prev.diet || null;
      const recovery = recoveryPlan || prev.recovery || null;
      if (prev.workout === workout && prev.diet === diet && prev.recovery === recovery) return h;
      return { ...h, [key]: { date: key, workout, diet, recovery, updatedAt: Date.now() } };
    });
  }, [workoutPlan, dietPlan, recoveryPlan]);

  const readiness = readinessScore(recovery);
  // recoveryPayload is what we send to the API (includes the computed score).
  const recoveryPayload = { ...recovery, readiness };

  // ---- AI coach (runs in the background, independent of the current page) ----
  const setLastCoach = (content) =>
    setCoachMessages((m) => {
      const copy = [...m];
      copy[copy.length - 1] = { role: "assistant", content };
      return copy;
    });

  const sendCoachMessage = async (text) => {
    const content = (text || "").trim();
    if (!content || coachBusy) return;
    const history = [...coachMessages, { role: "user", content }];
    setCoachMessages([...history, { role: "assistant", content: "" }]);
    setCoachBusy(true);
    try {
      // First: is this a request to edit the workout or meal plan?
      const act = await coachAct({
        profile,
        messages: history,
        recovery: recoveryPayload,
        workoutPlan,
        dietPlan,
      });
      if (act.action === "update") {
        const reason = (act.reason || "").trim();
        const generic = reason && reason.toLowerCase() !== "no reason provided" ? reason : "";
        if (act.approved && act.plan) {
          if (act.kind === "workout") setWorkoutPlan({ ...act.plan, _edited: true });
          else if (act.kind === "diet") setDietPlan({ ...act.plan, _edited: true });
          const label = act.kind === "workout" ? "workout plan" : "meal plan";
          const page = act.kind === "workout" ? "Workout" : "Diet";
          setLastCoach(
            `✅ Done — I've updated your ${label}.${generic ? " " + generic : ""}\n\nOpen the ${page} page to see the changes.`
          );
        } else {
          setLastCoach(
            `🤔 I didn't change your plan.${generic ? " " + generic : " That change didn't look suitable for your goals."}`
          );
        }
        return;
      }
      // Otherwise: normal streaming chat.
      await streamCoach({ profile, messages: history, recovery: recoveryPayload }, (full) =>
        setLastCoach(full)
      );
    } catch {
      setLastCoach("⚠ Sorry, I couldn't reach the coach. Is the server running?");
    } finally {
      setCoachBusy(false);
    }
  };

  // ---- Plan generation (also background-safe across navigation) ----
  const runGenerate = async (kind, fetchFn, setPlan) => {
    setGenState((s) => ({ ...s, [kind]: { loading: true, error: null } }));
    try {
      const plan = await fetchFn(profile, recoveryPayload);
      setPlan(plan);
      setGenState((s) => ({ ...s, [kind]: { loading: false, error: null } }));
    } catch (e) {
      setGenState((s) => ({ ...s, [kind]: { loading: false, error: e.message } }));
    }
  };
  const generateWorkout = () => runGenerate("workout", fetchWorkoutPlan, setWorkoutPlan);
  const generateDiet = () => runGenerate("diet", fetchDietPlan, setDietPlan);
  const generateRecovery = () => runGenerate("recovery", fetchRecoveryPlan, setRecoveryPlan);

  const value = {
    profile,
    setProfile,
    updateProfile: (patch) => setProfile((p) => ({ ...p, ...patch })),
    recovery,
    setRecovery,
    updateRecovery: (patch) => setRecovery((r) => ({ ...r, ...patch })),
    readiness,
    recoveryPayload,
    log,
    setLog,
    // Fitness trackers + today's synced device activity.
    trackers,
    activity,
    refreshTrackers,
    syncActivity,
    workoutPlan,
    setWorkoutPlan,
    dietPlan,
    setDietPlan,
    recoveryPlan,
    setRecoveryPlan,
    history,
    setHistory,
    mealLog,
    toggleMealEaten,
    workoutLog,
    logSet,
    removeSet,
    lastSession,
    // User-added calendar activities + per-day workout removal.
    calendar,
    addActivity,
    removeActivity,
    setWorkoutHidden,
    // Background-safe AI coach + plan generation.
    coachMessages,
    coachBusy,
    sendCoachMessage,
    genState,
    generateWorkout,
    generateDiet,
    generateRecovery,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
