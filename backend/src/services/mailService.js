import nodemailer from 'nodemailer';

// Normalize APP_BASE_URL/FRONTEND_URL: avoid "//?resetToken=" double slashes.
const getAppBaseUrl = () =>
  String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173')
    .trim()
    .replace(/\/+$/, '');

// Parse MAIL_FROM like `CollabHub <no-reply@example.com>` or `no-reply@example.com`.
const parseMailFrom = (raw) => {
  const value = String(raw || '').trim();
  const match = value.match(/^(.*)<(.+)>$/);
  if (match) {
    return { name: match[1].trim() || 'CollabHub', email: match[2].trim() };
  }
  return { name: 'CollabHub', email: value || 'no-reply@collabhub.local' };
};

// Preferred path on Render/cloud hosts: Brevo HTTP API (no SMTP ports, no IP allowlist).
const sendViaBrevoApi = async ({ toEmail, subject, textContent, htmlContent }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return false;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: parseMailFrom(process.env.MAIL_FROM),
      to: [{ email: toEmail }],
      subject,
      textContent,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${body.slice(0, 500)}`);
  }
  return true;
};

// SMTP fallback (works locally, or when API key is absent).
const sendViaSmtp = async ({ toEmail, subject, textContent, htmlContent }) => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return false;

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_SECURE || 0) === 1,
    auth: { user, pass },
  });
  await transporter.verify();
  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'no-reply@collabhub.local',
    to: toEmail,
    subject,
    text: textContent,
    html: htmlContent,
  });
  return true;
};

const deliver = async (payload) => {
  if (process.env.BREVO_API_KEY) {
    try {
      if (await sendViaBrevoApi(payload)) return true;
    } catch (err) {
      console.error(`[mail] Brevo API send to ${payload.toEmail} failed:`, err.message);
      // fall through to SMTP
    }
  }
  return sendViaSmtp(payload);
};

// Send via API/SMTP; if nothing is configured (or all transports fail),
// log the token links so auth flows stay testable.
const sendEmailOrLog = async ({ toEmail, subject, textContent, htmlContent, logLines }) => {
  try {
    if (await deliver({ toEmail, subject, textContent, htmlContent })) return;
  } catch (err) {
    console.error(`[mail] Delivery to ${toEmail} failed:`, err.message);
  }
  logLines.forEach((line) => console.log(`[mail fallback] ${line}`));
};

export const sendResetEmail = async ({ toEmail, resetToken }) => {
  const appUrl = getAppBaseUrl();
  const resetLink = `${appUrl}/?resetToken=${encodeURIComponent(resetToken)}`;
  await sendEmailOrLog({
    toEmail,
    subject: 'CollabHub Password Reset',
    textContent: `Use this link to reset your password: ${resetLink}`,
    htmlContent: `<p>Use this link to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`,
    logLines: [
      `Password reset token for ${toEmail}: ${resetToken}`,
      `Reset link: ${resetLink}`,
    ],
  });
};

export const sendVerificationEmail = async ({ toEmail, verificationToken, name }) => {
  const appUrl = getAppBaseUrl();
  const verifyLink = `${appUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  await sendEmailOrLog({
    toEmail,
    subject: 'Verify your CollabHub account',
    textContent: `Hi ${name},\n\nWelcome to CollabHub! Please verify your email by clicking this link:\n${verifyLink}\n\nThis link expires in 24 hours.`,
    htmlContent: `
      <p>Hi ${name},</p>
      <p>Welcome to CollabHub! Please verify your email by clicking the button below:</p>
      <p><a href="${verifyLink}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">Verify Email</a></p>
      <p>Or copy this link: <a href="${verifyLink}">${verifyLink}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
    logLines: [
      `Verification token for ${toEmail}: ${verificationToken}`,
      `Verify link: ${verifyLink}`,
    ],
  });
};
