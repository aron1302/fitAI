// Transactional email (verification + password reset). Transport order:
// Brevo HTTP API (works where SMTP ports are blocked, e.g. Render free tier),
// then SMTP via nodemailer, then a console transport that prints the message —
// including the link — to the server log, so flows are testable locally.

import nodemailer from "nodemailer";
import { config } from "./config.js";

// Parse `MAIL_FROM` ("FitAI <a@b.com>" or a bare address) into Brevo's
// { name, email } sender shape.
function parseFrom(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: from.trim() };
}

// Send through Brevo's transactional REST API (plain HTTPS — never blocked).
async function sendViaBrevo({ to, subject, text, html }) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": config.brevoApiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: parseFrom(config.smtp.from),
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Brevo API ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  const { url, host, port, user, pass } = config.smtp;
  transporter = url
    ? nodemailer.createTransport(url)
    : nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        // Fail fast instead of nodemailer's 2-minute default — a blocked SMTP
        // port should surface in the error log quickly.
        connectionTimeout: 15000,
        auth: user ? { user, pass } : undefined,
      });
  return transporter;
}

async function send({ to, subject, text, html }) {
  if (config.brevoApiKey) {
    return sendViaBrevo({ to, subject, text, html });
  }
  if (config.smtp.url || config.smtp.host) {
    const t = getTransport();
    return t.sendMail({ from: config.smtp.from, to, subject, text, html });
  }
  // No transport configured — log it so the link is usable in dev/testing.
  console.log(
    `\n  [email:console] To: ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, "\n  ")}\n`
  );
}

function htmlWrap(heading, body, link, cta) {
  return `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1b2336">
    <h2 style="margin:0 0 12px">${heading}</h2>
    <p style="color:#475569;line-height:1.6">${body}</p>
    <p style="margin:24px 0"><a href="${link}" style="background:#22d3ee;color:#06210f;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">${cta}</a></p>
    <p style="color:#94a3b8;font-size:13px">Or paste this link into your browser:<br>${link}</p>
  </div>`;
}

export async function sendVerificationEmail(to, link) {
  await send({
    to,
    subject: "Verify your FitAI email",
    text: `Welcome to FitAI! Confirm your email address by opening this link (valid for 24 hours):\n\n${link}\n\nIf you didn't create an account, you can safely ignore this email.`,
    html: htmlWrap(
      "Verify your email",
      "Confirm your email address to secure your FitAI account.",
      link,
      "Verify email"
    ),
  });
}

// Sent when someone tries to sign up with an address that already has an
// account (instead of revealing that fact to the requester).
export async function sendAccountExistsEmail(to, link) {
  await send({
    to,
    subject: "You already have a FitAI account",
    text: `Someone (hopefully you) tried to create a FitAI account with this email address, but you already have one.\n\nIf this was you, just log in instead: ${link}\nForgot your password? Use "Forgot password?" on the login screen.\n\nIf this wasn't you, no action is needed — no account was created and nothing has changed.`,
    html: htmlWrap(
      "You already have an account",
      "Someone (hopefully you) tried to sign up with this email address, but an account already exists. If this was you, just log in — or use “Forgot password?” if you can't remember it. If it wasn't you, no action is needed.",
      link,
      "Go to login"
    ),
  });
}

export async function sendPasswordResetEmail(to, link) {
  await send({
    to,
    subject: "Reset your FitAI password",
    text: `We received a request to reset your FitAI password. Open this link (valid for 1 hour) to choose a new one:\n\n${link}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
    html: htmlWrap(
      "Reset your password",
      "Choose a new password for your FitAI account. This link is valid for one hour.",
      link,
      "Reset password"
    ),
  });
}
