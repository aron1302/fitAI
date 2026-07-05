import { createContext, useContext, useEffect, useState } from "react";
import {
  fetchMe,
  loginRequest,
  signupRequest,
  logoutRequest,
  logoutAllRequest,
  logoutOthersRequest,
  deleteAccountRequest,
  resendVerification as resendVerificationRequest,
  verifyTwoFactor,
} from "../lib/api.js";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Keys the app caches in localStorage. Cleared on logout so a second account on
// the same browser never sees the previous user's cached data.
const CACHE_PREFIX = "fitai.";

function clearCache() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
  }
}

// Last-known signed-in user, so the app can open instantly (and work offline /
// through server cold starts) without waiting for the auth check. The session
// cookie is still the real credential — the server 401s anything stale.
const USER_CACHE_KEY = "fitai.user";

function cachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_CACHE_KEY)) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(cachedUser);
  // With a cached user we render the app immediately and verify in the
  // background; otherwise hold the splash until the server answers.
  const [loading, setLoading] = useState(() => cachedUser() === null);

  // Keep the localStorage copy in step with every auth state change.
  const setUser = (u) => {
    setUserState(u);
    try {
      if (u) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
      else localStorage.removeItem(USER_CACHE_KEY);
    } catch {
      // storage unavailable — cookie auth still works, just no instant boot
    }
  };

  // Check for an existing session on boot. A definitive answer (user or 401)
  // is applied; an unreachable server (free-tier instance waking from sleep,
  // or offline) is retried with backoff instead of being treated as a logout —
  // the session cookie is still valid, only the server is napping.
  useEffect(() => {
    let cancelled = false;
    let delay = 2000;
    const verify = () =>
      fetchMe().then(
        (u) => {
          if (cancelled) return;
          setUser(u);
          setLoading(false);
        },
        () => {
          if (cancelled) return;
          setTimeout(verify, delay);
          delay = Math.min(delay * 1.5, 15000);
        }
      );
    verify();
    return () => {
      cancelled = true;
    };
  }, []);

  // Returns the raw result: when { twoFactorRequired } the caller must complete
  // step 2 via completeTwoFactor; otherwise the user is now signed in.
  const login = async (email, password) => {
    const data = await loginRequest(email, password);
    if (data.twoFactorRequired) return data;
    clearCache();
    setUser(data.user);
    return data;
  };

  // Step 2 of a 2FA login.
  const completeTwoFactor = async (challenge, code) => {
    const u = await verifyTwoFactor(challenge, code);
    clearCache();
    setUser(u);
  };

  // Returns the raw result: { user } signs the new account in; { user: null,
  // message } means the caller should show the message (check-your-email case).
  const signup = async (email, password) => {
    const data = await signupRequest(email, password);
    if (data.user) {
      clearCache();
      setUser(data.user);
    }
    return data;
  };

  const logout = async () => {
    await logoutRequest();
    clearCache();
    setUser(null);
  };

  // Revoke every session (this device too) — used after a suspected compromise.
  const logoutEverywhere = async () => {
    await logoutAllRequest();
    clearCache();
    setUser(null);
  };

  // Revoke other devices but stay signed in here.
  const logoutOtherDevices = () => logoutOthersRequest();

  // Permanently delete the account and all data, then sign out.
  const deleteAccount = async () => {
    await deleteAccountRequest();
    clearCache();
    setUser(null);
  };

  // Re-fetch the current user (e.g. after email verification) without a
  // reload. Resolves with the fresh user so callers can react to the result.
  // If the server is momentarily unreachable, keep the current state.
  const refreshUser = () =>
    fetchMe().then(
      (u) => {
        setUser(u);
        return u;
      },
      () => user
    );

  const resendVerification = () => resendVerificationRequest();

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        completeTwoFactor,
        signup,
        logout,
        logoutEverywhere,
        logoutOtherDevices,
        deleteAccount,
        refreshUser,
        resendVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
