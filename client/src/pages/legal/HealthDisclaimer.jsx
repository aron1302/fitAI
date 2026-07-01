import LegalPage from "./LegalPage.jsx";

export default function HealthDisclaimer() {
  return (
    <LegalPage title="Health & Fitness Disclaimer" updated="[DATE]">
      <p>
        <b>FitAI does not provide medical advice.</b> All content — including AI-generated workout,
        diet, cardio, flexibility, and recovery plans, and AI coach responses — is for general
        informational and educational purposes only and is <b>not a substitute for professional
        medical advice, diagnosis, or treatment</b>.
      </p>

      <h2>Consult a professional first</h2>
      <p>
        Always seek the advice of your physician or another qualified health provider before starting
        any exercise or nutrition program, especially if you are pregnant, have a medical condition,
        an injury, take medication, or have any concern about your health. Never disregard or delay
        seeking professional advice because of something you read or received here.
      </p>

      <h2>AI has limitations</h2>
      <p>
        Recommendations are produced by automated systems that do not know your full medical history
        and can be inaccurate or inappropriate for you. You are responsible for evaluating whether any
        activity is safe and suitable for your circumstances.
      </p>

      <h2>Assumption of risk</h2>
      <p>
        Physical activity carries inherent risks, including injury. By using the Service you
        acknowledge these risks and agree that you participate voluntarily and at your own risk, to
        the fullest extent permitted by law. [Counsel: align with the liability terms and local law;
        consider an explicit acknowledgement checkbox at signup.]
      </p>

      <h2>Emergencies</h2>
      <p>
        If you think you may have a medical emergency, stop exercising and call your local emergency
        number immediately. Stop any activity that causes pain, dizziness, or shortness of breath.
      </p>
    </LegalPage>
  );
}
