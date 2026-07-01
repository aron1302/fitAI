import LegalPage from "./LegalPage.jsx";

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="[DATE]">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of FitAI (the
        &ldquo;Service&rdquo;) provided by <b>[Company / Legal Entity]</b> (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By creating an account or using the Service, you agree to these Terms.
        If you do not agree, do not use the Service.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least [16/18] years old and able to form a binding contract. The Service is
        not directed to children. [Confirm minimum age against COPPA/GDPR-K and your market.]
      </p>

      <h2>2. Accounts</h2>
      <p>
        You are responsible for safeguarding your credentials and for all activity under your
        account. Notify us immediately of any unauthorised use.
      </p>

      <h2>3. Health &amp; fitness content is not medical advice</h2>
      <p>
        FitAI provides general fitness and nutrition information, including AI-generated plans. It is{" "}
        <b>not medical advice</b> and is not a substitute for professional care. See our{" "}
        <a href="/legal/health">Health Disclaimer</a>, which forms part of these Terms.
      </p>

      <h2>4. AI-generated output</h2>
      <p>
        Plans, coaching responses, and suggestions are produced by automated systems (and, where
        configured, third-party AI providers). Output may be inaccurate, incomplete, or unsuitable
        for you. You are responsible for evaluating it and for your own safety.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        You agree not to misuse the Service, including: attempting to breach security, scraping,
        reverse-engineering, overloading the system, or using it for unlawful purposes.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The Service and its content are owned by [Company] or its licensors. You retain ownership of
        the data you submit and grant us a limited licence to process it to operate the Service.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTIES OF ANY KIND, TO THE FULLEST
        EXTENT PERMITTED BY LAW. [Insert jurisdiction-specific warranty language.]
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        TO THE EXTENT PERMITTED BY LAW, [COMPANY] WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, OR
        CONSEQUENTIAL DAMAGES, OR FOR ANY HEALTH OUTCOME ARISING FROM USE OF THE SERVICE. [Counsel to
        set caps and carve-outs per jurisdiction.]
      </p>

      <h2>9. Termination</h2>
      <p>You may delete your account at any time. We may suspend or terminate access for breach.</p>

      <h2>10. Changes</h2>
      <p>We may update these Terms; material changes will be notified [method]. Continued use means acceptance.</p>

      <h2>11. Governing law</h2>
      <p>These Terms are governed by the laws of [jurisdiction], without regard to conflict-of-laws rules.</p>

      <h2>12. Contact</h2>
      <p>[Company], [address]. Questions: [legal@contact-email].</p>
    </LegalPage>
  );
}
