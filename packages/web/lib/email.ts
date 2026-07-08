/**
 * Server-only transactional email — Resend's REST API via fetch (no SDK dependency).
 *
 * `RESEND_API_KEY` unset (local dev default) = email DISABLED: sends are logged to the server
 * console (including the action link, so dev flows stay walkable) and the auth features that
 * depend on delivery soften — signup auto-verifies instead of requiring a click-through
 * (see `emailEnabled` consumers in auth.ts / actions.ts).
 *
 * Resend note: without a verified domain, the default `onboarding@resend.dev` sender only
 * delivers to the Resend account owner's own address — verify a domain + set EMAIL_FROM
 * before real users need these emails.
 */

import { createLogger } from '@sync/logger';

const log = createLogger('web:email');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Sync <onboarding@resend.dev>';

/** Whether real email delivery is configured — gates the verification requirement. */
export const emailEnabled = Boolean(RESEND_API_KEY);

const baseUrl = (process.env.AUTH_URL || 'http://localhost:3000').replace(/\/+$/, '');

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  if (!RESEND_API_KEY) {
    // Dev default (no key): email delivery is disabled — log the action link so auth flows stay
    // walkable. The full body carries the token, so keep this at debug (verbose, dev-only) level.
    log.debug({ to: input.to, subject: input.subject, body: input.text }, 'RESEND_API_KEY not set — email NOT sent');
    return true;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
    });
    if (!res.ok) {
      log.error({ status: res.status, body: (await res.text()).slice(0, 300) }, 'Resend send failed');
      return false;
    }
    log.info({ to: input.to, subject: input.subject }, 'email sent');
    return true;
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'email send failed');
    return false;
  }
}

/** Minimal branded (Sync indigo) single-CTA email shell. */
function authEmail(heading: string, body: string, cta: { label: string; url: string }): { html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f4f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c2030;">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ef;border-radius:12px;padding:32px;">
    <div style="width:36px;height:36px;border-radius:9px;background:#3b50e0;color:#fff;font-weight:700;font-size:15px;text-align:center;line-height:36px;">S</div>
    <h1 style="font-size:18px;margin:20px 0 8px;">${heading}</h1>
    <p style="font-size:14px;line-height:1.6;color:#4b5165;margin:0 0 24px;">${body}</p>
    <a href="${cta.url}" style="display:inline-block;background:#3b50e0;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">${cta.label}</a>
    <p style="font-size:12px;color:#8a90a5;margin:24px 0 0;">If the button doesn't work, paste this link into your browser:<br/><span style="word-break:break-all;">${cta.url}</span></p>
  </div>
</body></html>`;
  const text = `${heading}\n\n${body}\n\n${cta.label}: ${cta.url}\n`;
  return { html, text };
}

export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const url = `${baseUrl}/verify-email?token=${token}`;
  const { html, text } = authEmail(
    'Verify your email',
    'Welcome to Sync! Confirm this email address to activate your account. This link is valid for 24 hours.',
    { label: 'Verify email', url },
  );
  return sendEmail({ to, subject: 'Verify your email — Sync Studio', html, text });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const url = `${baseUrl}/reset-password?token=${token}`;
  const { html, text } = authEmail(
    'Reset your password',
    'We received a request to reset your Sync Studio password. This link is valid for 1 hour. If you didn’t ask for this, you can safely ignore this email.',
    { label: 'Reset password', url },
  );
  return sendEmail({ to, subject: 'Reset your password — Sync Studio', html, text });
}
