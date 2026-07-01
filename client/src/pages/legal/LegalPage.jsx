import { Link } from "react-router-dom";
import DraftBanner from "../../components/DraftBanner.jsx";

const LINKS = [
  { to: "/legal/terms", label: "Terms of Service" },
  { to: "/legal/privacy", label: "Privacy Policy" },
  { to: "/legal/health", label: "Health Disclaimer" },
];

// Shared, publicly-accessible shell for the legal documents (reachable without
// being logged in).
export default function LegalPage({ title, updated, children }) {
  return (
    <div className="legal-screen">
      <div className="legal-card">
        <div className="brand" style={{ marginBottom: 10 }}>
          <div className="logo">F</div>
          <div className="brand-text">
            <b>
              Fit<span>AI</span>
            </b>
            <small>Legal</small>
          </div>
        </div>
        <DraftBanner />
        <h1 className="legal-title">{title}</h1>
        {updated && <p className="legal-updated">Last updated: {updated} (placeholder date)</p>}
        <div className="legal-body">{children}</div>
        <nav className="legal-nav">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
          <Link to="/">← Back to app</Link>
        </nav>
      </div>
    </div>
  );
}
