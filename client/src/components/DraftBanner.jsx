// Prominent, unmissable warning shown on every legal document. These are
// templates, not finalised legal text — they MUST be reviewed by a qualified
// attorney before the app is offered to the public.
export default function DraftBanner() {
  return (
    <div className="draft-banner" role="alert">
      <b>⚠️ DRAFT — NOT YET LEGALLY REVIEWED.</b> This document is a placeholder template provided
      for scaffolding only. It is <b>not legal advice</b> and must be reviewed, completed, and
      approved by a qualified attorney (covering your jurisdiction, GDPR/CCPA, and health-data
      rules) before this product is made available to users.
    </div>
  );
}
