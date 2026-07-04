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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for an existing session on boot.
  useEffect(() => {
    fetchMe().then((u) => {
      setUser(u);
      setLoading(false);
    });
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

  // Re-fetch the current user (e.g. after email verification) without a reload.
  const refreshUser = () => fetchMe().then(setUser);

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
