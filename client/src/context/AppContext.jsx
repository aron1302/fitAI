import { createContext, useContext, useEffect, useRef, useState } from "react";
import { readinessScore } from "../lib/calc.js";
import {
  fetchState,
  fetchWorkoutPlan,
  fetchDietPlan,
  fetchRecoveryPlan,
  coachAct,
  streamCoach,
  fetchTrackers,
  fetchActivity,
  syncFitbit,
} from "../lib/api.js";
import { enqueueSave, releaseSaves, unsyncedKeys, clearUnsynced } from "../lib/sync.js";
import { findExerciseKey, exerciseSessions, mergeWorkoutLogs } from "../lib/workoutLog.js";

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
const WORKOUT_SESSIONS_KEY = "fitai.workoutSessions";
const EATEN_MEALS_KEY = "fitai.eatenMeals";
const CALENDAR_KEY = "fitai.calendar";

// Server state key → its localStorage cache key, for re-sending values the
// server never confirmed (see the unsynced handling in the hydration effect).
const LS_BY_SERVER_KEY = {
  profile: PROFILE_KEY,
  recovery: RECOVERY_KEY,
  log: LOG_KEY,
  workoutPlan: WORKOUT_PLAN_KEY,
  dietPlan: DIET_PLAN_KEY,
  recoveryPlan: RECOVERY_PLAN_KEY,
  history: HISTORY_KEY,
  mealLog: MEAL_LOG_KEY,
  workoutLog: WORKOUT_LOG_KEY,
  workoutSessions: WORKOUT_SESSIONS_KEY,
  eatenMeals: EATEN_MEALS_KEY,
  calendar: CALENDAR_KEY,
};

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
  heightUnit: "cm", // display/entry preference only; heightCm stays canonical
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

// The cached value exactly as stored (no fallback merge), or null.
function loadRaw(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Persist one state slice whenever it changes: to localStorage immediately
// (instant reload / offline cache) and to the server through the reliable
// save queue. Guarded by reference identity, not "first run": the mount
// render (and StrictMode's dev-mode re-run of it) sees the value just loaded
// from that same cache — nothing changed, and queueing it would falsely mark
// every key as ahead of the server on every boot.
function usePersist(lsKey, serverKey, value) {
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    if (value == null) return; // plans start as null — never store that
    try {
      localStorage.setItem(lsKey, JSON.stringify(value));
    } catch {
      // storage unavailable — the queued server save below still runs
    }
    enqueueSave(serverKey, value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Timed workout sessions, keyed by `${date}#${planDayIndex}`. Each value is
  // { startedAt, endedAt? } (epoch ms); endedAt present once the user has
  // finished, at which point the Log Workout page shows the session summary.
  const [workoutSessions, setWorkoutSessions] = useState(() => load(WORKOUT_SESSIONS_KEY, {}));
  // Free-form meals the user actually ate (from the "plan as you go" analyser),
  // keyed by date: [{ id, name, calories, protein_g, carbs_g, fat_g, time }].
  const [eatenMeals, setEatenMeals] = useState(() => load(EATEN_MEALS_KEY, {}));
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

  // The server is normally the source of truth and localStorage an
  // instant-load cache — EXCEPT for keys the sync queue has flagged as
  // unsynced, where the local cache holds confirmed-newer data the server
  // never received. `stateLoaded` flips once this reconciliation has run, for
  // consumers that must wait for the server's answer (e.g. first-login
  // onboarding shouldn't fire off the default profile).
  const [stateLoaded, setStateLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchState().then((s) => {
      if (cancelled) return;
      // Keys whose latest local value the server never confirmed receiving —
      // saves that failed on a flaky connection, or edits made while a
      // previous boot was still hydrating. For those the local cache is AHEAD
      // of the server: applying the server copy over it would destroy data
      // (a whole gym session, in the worst case). Local wins; the workout log
      // — where both sides may hold real sessions — is deep-merged.
      const unsynced = unsyncedKeys();
      const apply = (key, applyServer) => {
        if (s[key] != null && !unsynced.has(key)) applyServer(s[key]);
      };
      if (s) {
        apply("profile", (v) => setProfile((p) => ({ ...p, ...v })));
        apply("recovery", (v) => setRecovery((r) => ({ ...r, ...v })));
        apply("log", setLog);
        apply("workoutPlan", setWorkoutPlan);
        apply("dietPlan", setDietPlan);
        apply("recoveryPlan", setRecoveryPlan);
        apply("history", setHistory);
        apply("mealLog", setMealLog);
        if (s.workoutLog) {
          setWorkoutLog((local) =>
            unsynced.has("workoutLog") ? mergeWorkoutLogs(s.workoutLog, local) : s.workoutLog
          );
        }
        apply("workoutSessions", setWorkoutSessions);
        apply("eatenMeals", setEatenMeals);
        apply("calendar", setCalendar);
      }
      setStateLoaded(true);
      // Re-send everything the server is still missing. The merged workout
      // log is queued by its persist effect (the merge changes state), so it
      // is skipped here to avoid briefly pushing the pre-merge local copy.
      for (const key of unsynced) {
        if (key === "workoutLog" && s?.workoutLog) continue;
        const value = loadRaw(LS_BY_SERVER_KEY[key]);
        if (value != null) enqueueSave(key, value);
        else clearUnsynced(key); // stale flag with no cached value behind it
      }
      // Only now may queued saves reach the server: hydration has reconciled
      // local and server state, so nothing stale can overwrite newer data.
      releaseSaves();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  usePersist(PROFILE_KEY, "profile", profile);
  usePersist(RECOVERY_KEY, "recovery", recovery);
  usePersist(LOG_KEY, "log", log);
  usePersist(WORKOUT_PLAN_KEY, "workoutPlan", workoutPlan);
  usePersist(DIET_PLAN_KEY, "dietPlan", dietPlan);
  usePersist(RECOVERY_PLAN_KEY, "recoveryPlan", recoveryPlan);
  usePersist(HISTORY_KEY, "history", history);
  usePersist(MEAL_LOG_KEY, "mealLog", mealLog);
  usePersist(WORKOUT_LOG_KEY, "workoutLog", workoutLog);
  usePersist(WORKOUT_SESSIONS_KEY, "workoutSessions", workoutSessions);
  usePersist(EATEN_MEALS_KEY, "eatenMeals", eatenMeals);
  usePersist(CALENDAR_KEY, "calendar", calendar);

  // Log / remove a free-form meal the user actually ate (from the
  // "plan as you go" analyser) for a given day (defaults to today).
  const addEatenMeal = (meal, day = dateKey()) =>
    setEatenMeals((em) => ({ ...em, [day]: [...(em[day] || []), { id: newId(), ...meal }] }));
  const removeEatenMeal = (id, day = dateKey()) =>
    setEatenMeals((em) => {
      const list = (em[day] || []).filter((m) => m.id !== id);
      const next = { ...em, [day]: list };
      if (!list.length) delete next[day];
      return next;
    });

  // Toggle a meal as eaten/not-eaten for a given day (defaults to today).
  const toggleMealEaten = (mealName, day = dateKey()) =>
    setMealLog((m) => {
      const dayLog = { ...(m[day] || {}) };
      if (dayLog[mealName]) delete dayLog[mealName];
      else dayLog[mealName] = true;
      return { ...m, [day]: dayLog };
    });

  // Append a performed set ({ weight, reps }) for an exercise on a given day.
  // Sets land under the day's existing spelling of the exercise (if any), so a
  // plan edit that tweaks capitalisation doesn't split the day into two rows.
  const logSet = (exercise, set, day = dateKey()) =>
    setWorkoutLog((w) => {
      const dayLog = { ...(w[day] || {}) };
      const key = findExerciseKey(dayLog, exercise) || exercise;
      dayLog[key] = [...(dayLog[key] || []), set];
      return { ...w, [day]: dayLog };
    });

  // Remove the set at `index` for an exercise on a given day.
  const removeSet = (exercise, index, day = dateKey()) =>
    setWorkoutLog((w) => {
      const dayLog = { ...(w[day] || {}) };
      const key = findExerciseKey(dayLog, exercise);
      if (!key) return w;
      const sets = dayLog[key].filter((_, i) => i !== index);
      if (sets.length) dayLog[key] = sets;
      else delete dayLog[key];
      return { ...w, [day]: dayLog };
    });

  // ---- Timed workout sessions (Log Workout page) ----
  // Start the timer for a session key if it isn't already running/finished, so
  // re-mounts and repeat visits keep the original start time.
  const startWorkoutSession = (key) =>
    setWorkoutSessions((ws) => (ws[key] ? ws : { ...ws, [key]: { startedAt: Date.now() } }));

  // Stop the timer; the page switches to the session summary.
  const endWorkoutSession = (key) =>
    setWorkoutSessions((ws) =>
      ws[key] && !ws[key].endedAt ? { ...ws, [key]: { ...ws[key], endedAt: Date.now() } } : ws
    );

  // Un-end a session (e.g. "End workout" tapped too early). The time spent on
  // the summary screen is excluded by shifting startedAt forward by the gap.
  const resumeWorkoutSession = (key) =>
    setWorkoutSessions((ws) => {
      const s = ws[key];
      if (!s?.endedAt) return ws;
      return { ...ws, [key]: { startedAt: s.startedAt + (Date.now() - s.endedAt) } };
    });

  // True once the timed session for a plan day (default: today) has been ended.
  // Drives "Log workout" buttons flipping to "View workout" across the app.
  const sessionCompleted = (dayIndex, day = dateKey()) =>
    !!workoutSessions[`${day}#${dayIndex}`]?.endedAt;

  // The most recent prior day (before `day`) on which this exercise was logged,
  // returned as { date, sets } — used to show last-session numbers for progress.
  // Matching is name-normalised (see workoutLog.js) so renamed plans still
  // find their history.
  const lastSession = (exercise, day = dateKey()) => {
    const sessions = exerciseSessions(workoutLog, exercise).filter((s) => s.date < day);
    return sessions.length ? sessions[sessions.length - 1] : null;
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
  // Place one of the plan's sessions (by index in workoutPlan.days) on a rest
  // day, or clear it again with idx = null.
  const setWorkoutAdded = (day, idx) =>
    setCalendar((c) => {
      const e = c[day] || { activities: [], hideWorkout: false };
      return { ...c, [day]: { ...e, addWorkoutIdx: idx ?? undefined } };
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
    stateLoaded,
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
    eatenMeals,
    addEatenMeal,
    removeEatenMeal,
    workoutLog,
    logSet,
    removeSet,
    lastSession,
    workoutSessions,
    startWorkoutSession,
    endWorkoutSession,
    resumeWorkoutSession,
    sessionCompleted,
    // User-added calendar activities + per-day workout removal.
    calendar,
    addActivity,
    removeActivity,
    setWorkoutHidden,
    setWorkoutAdded,
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
