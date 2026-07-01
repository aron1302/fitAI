import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppProvider } from "./context/AppContext.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import CookieConsent from "./components/CookieConsent.jsx";
import App from "./App.jsx";
import Auth from "./pages/Auth.jsx";
import Terms from "./pages/legal/Terms.jsx";
import Privacy from "./pages/legal/Privacy.jsx";
import HealthDisclaimer from "./pages/legal/HealthDisclaimer.jsx";
import VerifyEmail from "./pages/auth/VerifyEmail.jsx";
import ResetPassword from "./pages/auth/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Workout from "./pages/Workout.jsx";
import LogWorkout from "./pages/LogWorkout.jsx";
import Diet from "./pages/Diet.jsx";
import Cardio from "./pages/Cardio.jsx";
import Flexibility from "./pages/Flexibility.jsx";
import Coach from "./pages/Coach.jsx";
import Calendar from "./pages/Calendar.jsx";
import Profile from "./pages/Profile.jsx";
import "./index.css";

// Decide what to render based on auth state: a loading splash, the auth screen,
// or the full app. AppProvider is keyed by user id so its state (and the
// server hydration) resets cleanly when the logged-in user changes.
// Legal pages are public — reachable whether or not someone is logged in.
const LEGAL_ROUTES = (
  <>
    <Route path="/legal/terms" element={<Terms />} />
    <Route path="/legal/privacy" element={<Privacy />} />
    <Route path="/legal/health" element={<HealthDisclaimer />} />
    <Route path="/legal/*" element={<Navigate to="/legal/terms" replace />} />
  </>
);

// Routes reachable without being logged in.
const PUBLIC_PREFIXES = ["/legal", "/verify-email", "/reset-password"];

function Root() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Serve legal docs + email verification/reset without requiring auth (the
  // links arrive by email or from the login screen).
  if (PUBLIC_PREFIXES.some((p) => location.pathname.startsWith(p))) {
    return (
      <Routes>
        {LEGAL_ROUTES}
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">Loading…</div>
      </div>
    );
  }

  if (!user) return <Auth />;

  return (
    <AppProvider key={user.id}>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="workout" element={<Workout />} />
          <Route path="workout/log/:dayIndex" element={<LogWorkout />} />
          <Route path="diet" element={<Diet />} />
          <Route path="cardio" element={<Cardio />} />
          <Route path="flexibility" element={<Flexibility />} />
          <Route path="coach" element={<Coach />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Root />
          <CookieConsent />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
