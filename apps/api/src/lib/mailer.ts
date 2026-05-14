// Email abstraction.
//
// In production we expect a provider (Resend, SendGrid, Postmark, SES). The
// concrete implementation is intentionally pluggable — for now the only
// transports are:
//
//   - 'resend' if RESEND_API_KEY is set (Resend's HTTP API, no SDK required)
//   - 'log'    fallback for local development — writes the rendered email to
//             the structured logger so you can copy the verification link
//             from the terminal during testing.
//
// Switching providers later only requires adding a new branch in `send()`.

import { logger } from './logger';

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? 'CricOS <no-reply@cricos.app>';

async function sendViaResend(args: SendArgs): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API responded ${res.status}: ${body}`);
  }
}

export async function sendEmail(args: SendArgs): Promise<void> {
  try {
    if (RESEND_API_KEY) {
      await sendViaResend(args);
      logger.info({ to: args.to, subject: args.subject }, 'Email sent');
      return;
    }
    // Local dev fallback — log the email so verification links are visible.
    logger.info(
      { to: args.to, subject: args.subject, body: args.text },
      'Email (dev fallback, no provider configured)',
    );
  } catch (err) {
    // We deliberately don't rethrow — registration/reset flows shouldn't fail
    // just because the mail provider is down. The user can re-trigger via
    // "Resend verification".
    logger.error({ err, to: args.to }, 'Email send failed');
  }
}

// ─── TEMPLATES ───────────────────────────────────────────────
// Kept inline (and small) — no template engine. URLs are passed in.

export function verificationEmail(opts: { name: string; verifyUrl: string }): SendArgs {
  const { name, verifyUrl } = opts;
  return {
    to: '',
    subject: 'Verify your CricOS email',
    text:
      `Hi ${name},\n\nVerify your CricOS account by visiting:\n${verifyUrl}\n\n` +
      `This link expires in 24 hours. If you did not sign up, you can safely ignore this email.\n`,
    html:
      `<p>Hi ${name},</p>` +
      `<p>Verify your CricOS account by clicking the link below:</p>` +
      `<p><a href="${verifyUrl}">Verify my email</a></p>` +
      `<p>This link expires in 24 hours. If you did not sign up, you can safely ignore this email.</p>`,
  };
}

export function passwordResetEmail(opts: { name: string; resetUrl: string }): SendArgs {
  const { name, resetUrl } = opts;
  return {
    to: '',
    subject: 'Reset your CricOS password',
    text:
      `Hi ${name},\n\nReset your CricOS password by visiting:\n${resetUrl}\n\n` +
      `This link expires in 1 hour. If you didn't request a reset, you can ignore this email.\n`,
    html:
      `<p>Hi ${name},</p>` +
      `<p>You asked to reset your CricOS password. Click below to choose a new one:</p>` +
      `<p><a href="${resetUrl}">Reset my password</a></p>` +
      `<p>This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.</p>`,
  };
}
