import LegalPage from "./LegalPage.jsx";

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="[DATE]">
      <p>
        This Privacy Policy explains how <b>[Company / Legal Entity]</b> collects, uses, and protects
        your information when you use FitAI. [Counsel to confirm controller identity, EU/UK
        representative, and DPO contact if required.]
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <b>Account data:</b> email address and a securely hashed password.
        </li>
        <li>
          <b>Health &amp; fitness inputs you provide:</b> age, sex, height, weight, goals, training
          days, injuries/impairments, and recovery metrics (sleep, resting heart rate, HRV, soreness,
          stress). Some of this may be considered <b>health data / a special category of personal
          data</b> under GDPR Art. 9 — processed on the basis of your <b>explicit consent</b>.
        </li>
        <li>
          <b>Usage &amp; logs:</b> generated plans, logged workouts, calendar entries, and a security
          audit log that stores only a <i>hashed</i> IP address and event type — never your raw IP.
        </li>
      </ul>

      <h2>2. How we use it</h2>
      <p>
        To provide the Service: generate and store your plans, personalise recommendations, keep you
        signed in, and protect the account. We do <b>not</b> sell your personal data.
      </p>

      <h2>3. AI &amp; third-party processing (important)</h2>
      <p>
        When an AI provider is enabled, your profile, recovery data, and coach messages are sent to
        that provider to generate plans and responses. Depending on configuration this may be{" "}
        <b>Anthropic</b> or <b>Google (Gemini)</b> (cloud), or a <b>local model (Ollama)</b> /
        rule-based engine that keeps data on our own infrastructure. [List the exact processors, their
        locations, and link their terms; execute Data Processing Agreements.] When the local or
        rule-based engine is used, your data is not sent to any third party.
      </p>

      <h2>4. Cookies</h2>
      <p>
        We use only <b>strictly necessary</b> cookies: a session cookie to keep you signed in and a
        CSRF-protection token. We do not use advertising or cross-site tracking cookies. [If analytics
        are added later, update this and the consent banner accordingly.]
      </p>

      <h2>5. Legal bases (GDPR)</h2>
      <ul>
        <li>Performance of a contract — to operate your account and deliver the Service.</li>
        <li>Explicit consent — for processing health/special-category data.</li>
        <li>Legitimate interests — security, fraud/abuse prevention, and audit logging.</li>
      </ul>

      <h2>6. Your rights (GDPR / CCPA)</h2>
      <p>
        You can <b>access and export</b> all your data, and <b>delete your account and data</b>, at
        any time from <b>Profile → Privacy &amp; Security</b>. You may also have rights to
        rectification, restriction, objection, and to withdraw consent. To exercise other rights or to
        complain to a supervisory authority, contact [privacy@contact-email]. We do not sell personal
        information (CCPA &ldquo;Do Not Sell&rdquo; therefore does not apply, but the control is
        documented here).
      </p>

      <h2>7. Data retention</h2>
      <p>
        We retain your data while your account is active. On deletion, account and app data are
        removed; pseudonymous security-audit records (hashed IP + event) may be retained for a limited
        period for security and legal compliance. [Set retention periods.]
      </p>

      <h2>8. Security</h2>
      <p>
        Passwords are hashed with bcrypt; sessions are server-side and revocable; traffic is served
        over HTTPS in production; the API enforces CSRF protection, security headers, rate limiting,
        and failed-login lockout. No system is perfectly secure.
      </p>

      <h2>9. International transfers &amp; children</h2>
      <p>
        [Describe transfer mechanisms (SCCs etc.) if data leaves your region.] The Service is not
        intended for children under [age].
      </p>

      <h2>10. Contact</h2>
      <p>[Company], [address]. Privacy enquiries: [privacy@contact-email]. DPO: [if applicable].</p>
    </LegalPage>
  );
}
