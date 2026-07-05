import { useEffect, useRef, useState } from "react";
import { NavLink, Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getStatus } from "./lib/api.js";
import { useAuth } from "./context/AuthContext.jsx";
import { useApp } from "./context/AppContext.jsx";
import { NAV_ICONS } from "./components/NavIcons.jsx";
import VerifyBanner from "./components/VerifyBanner.jsx";

const NAV = [
  { to: "/", icon: "dashboard", label: "Dashboard", short: "Home", end: true },
  { to: "/workout", icon: "workout", label: "Workout Plan", short: "Workout" },
  { to: "/diet", icon: "diet", label: "Diet Plan", short: "Diet" },
  { to: "/cardio", icon: "cardio", label: "Cardio" },
  { to: "/flexibility", icon: "flexibility", label: "Flexibility" },
  { to: "/coach", icon: "coach", label: "AI Coach", short: "Coach" },
  { to: "/calendar", icon: "calendar", label: "Calendar" },
  { to: "/profile", icon: "profile", label: "Profile" },
];

// On phones the bottom tab bar shows these primary destinations; everything
// else lives in the slide-up "More" sheet.
const PRIMARY = ["/", "/workout", "/diet", "/coach"];
const primaryNav = NAV.filter((n) => PRIMARY.includes(n.to));
const secondaryNav = NAV.filter((n) => !PRIMARY.includes(n.to));

function aiLabel(status) {
  if (status.ai === null) return "Checking AI…";
  if (!status.ai) return "Rule-based mode";
  return status.provider === "gemini"
    ? "Gemini AI active"
    : status.provider === "ollama"
      ? "Local AI active"
      : "Claude AI active";
}

// Shared between the desktop sidebar and the mobile "More" sheet so there's a
// single source of truth for the provider badge.
function AiBadge({ status }) {
  return (
    <div className="ai-badge">
      {status.ai === null ? (
        <span>
          <span className="dot off" />
          Checking AI…
        </span>
      ) : status.ai ? (
        <span>
          <span className="dot on" />
          {aiLabel(status)}
          <br />
          <span className="muted" style={{ fontSize: 11 }}>
            {status.model}
          </span>
        </span>
      ) : (
        <span>
          <span className="dot off" />
          Rule-based mode
          <br />
          <span className="muted" style={{ fontSize: 11 }}>
            Add API key for full AI
          </span>
        </span>
      )}
    </div>
  );
}

function UserBox({ user, logout }) {
  if (!user) return null;
  return (
    <div className="user-box">
      <span className="user-email" title={user.email}>
        {user.email}
      </span>
      <button className="logout-btn" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState({ ai: null });
  const [moreOpen, setMoreOpen] = useState(false);
  const { user, logout } = useAuth();
  const { profile, stateLoaded } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    getStatus().then(setStatus);
  }, []);

  // First login: once the server confirms this account has never completed its
  // profile, take the user to the Profile page to fill in their details. Fires
  // at most once per session so they can still navigate away freely.
  const sentToSetup = useRef(false);
  useEffect(() => {
    if (!stateLoaded || profile.onboarded || sentToSetup.current) return;
    sentToSetup.current = true;
    if (location.pathname !== "/profile") navigate("/profile");
  }, [stateLoaded, profile.onboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top + close the mobile "More" sheet on every route change.
  useEffect(() => {
    window.scrollTo(0, 0);
    setMoreOpen(false);
  }, [location.pathname]);

  // Let Escape dismiss the sheet.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  // Highlight the "More" tab when a secondary page is open.
  const onSecondary = secondaryNav.some(
    (n) => location.pathname === n.to || location.pathname.startsWith(n.to + "/")
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">F</div>
          <div className="brand-text">
            <b>
              Fit<span>AI</span>
            </b>
            <small>Train smarter</small>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-section">Menu</div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <span className="ico">{NAV_ICONS[n.icon]}</span>
              <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="nav-spacer" />
        <UserBox user={user} logout={logout} />
        <AiBadge status={status} />
      </aside>

      {/* Compact top bar for phones/tablets (the sidebar is hidden there). */}
      <header className="mobile-topbar">
        <Link to="/" className="brand">
          <div className="logo">F</div>
          <div className="brand-text">
            <b>
              Fit<span>AI</span>
            </b>
          </div>
        </Link>
        <span className="topbar-ai" title={aiLabel(status)}>
          <span className={`dot ${status.ai ? "on" : "off"}`} />
          <span className="topbar-ai-label">{aiLabel(status)}</span>
        </span>
      </header>

      <main className="main">
        <VerifyBanner />
        <Outlet context={{ status }} />
        <footer className="app-footer">
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/health">Health Disclaimer</Link>
          <span className="muted">FitAI is not medical advice.</span>
        </footer>
      </main>

      {/* Mobile bottom tab bar. */}
      <nav className="bottom-nav" aria-label="Primary">
        {primaryNav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="bottom-link">
            <span className="ico">{NAV_ICONS[n.icon]}</span>
            <span className="bottom-label">{n.short || n.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`bottom-link more-btn${onSecondary || moreOpen ? " active" : ""}`}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="ico">{NAV_ICONS.more}</span>
          <span className="bottom-label">More</span>
        </button>
      </nav>

      {/* Slide-up "More" sheet for secondary destinations + account. */}
      <div
        className={`sheet-backdrop${moreOpen ? " open" : ""}`}
        onClick={() => setMoreOpen(false)}
        aria-hidden="true"
      />
      <aside className={`more-sheet${moreOpen ? " open" : ""}`} aria-hidden={!moreOpen}>
        <div className="sheet-grip" />
        <div className="more-grid">
          {secondaryNav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="more-tile">
              <span className="ico">{NAV_ICONS[n.icon]}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </div>
        <UserBox user={user} logout={logout} />
        <AiBadge status={status} />
      </aside>
    </div>
  );
}
