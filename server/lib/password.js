// Password-strength policy. Pure (no I/O) so it's easy to unit-test and reuse.

// A few of the most-guessed passwords; rejected outright regardless of rules.
export const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "letmein", "iloveyou", "admin123", "welcome1", "football",
  "monkey123", "abc12345", "passw0rd", "changeme", "fitai123",
]);

// Requires 8+ chars and either 12+ chars or a mix of at least three character
// classes, and rejects obvious/common passwords and ones that echo the email.
// Returns { ok: true } or { ok: false, error }.
export function validatePassword(password, email = "") {
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, error: "password must be at least 8 characters" };
  }
  if (password.length > 200) {
    return { ok: false, error: "password is too long" };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, error: "that password is too common — choose something less guessable" };
  }
  const local = String(email).split("@")[0].toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) {
    return { ok: false, error: "password must not contain your email name" };
  }
  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));
  if (password.length < 12 && classes < 3) {
    return {
      ok: false,
      error:
        "password needs upper- and lower-case letters plus a number or symbol (or be 12+ characters)",
    };
  }
  return { ok: true };
}
