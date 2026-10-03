import nodemailer from 'nodemailer';

let transporter;

const buildTransport = async () => {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: Number(process.env.SMTP_SECURE || 0) === 1,
    auth: { user, pass },
  });

  await transporter.verify();
  return transporter;
};

export const sendResetEmail = async ({ toEmail, resetToken }) => {
  const appUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetLink = `${appUrl}/?resetToken=${encodeURIComponent(resetToken)}`;
  const tx = await buildTransport();

  if (!tx) {
    console.log(`Password reset token for ${toEmail}: ${resetToken}`);
    console.log(`Reset link: ${resetLink}`);
    return;
  }

  await tx.sendMail({
    from: process.env.MAIL_FROM || 'no-reply@collabhub.local',
    to: toEmail,
    subject: 'CollabHub Password Reset',
    text: `Use this link to reset your password: ${resetLink}`,
    html: `<p>Use this link to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`,
  });
};

export const sendVerificationEmail = async ({ toEmail, verificationToken, name }) => {
  const appUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  const verifyLink = `${appUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const tx = await buildTransport();

  if (!tx) {
    console.log(`Verification token for ${toEmail}: ${verificationToken}`);
    console.log(`Verify link: ${verifyLink}`);
    return;
  }

  await tx.sendMail({
    from: process.env.MAIL_FROM || 'no-reply@collabhub.local',
    to: toEmail,
    subject: 'Verify your CollabHub account',
    text: `Hi ${name},\n\nWelcome to CollabHub! Please verify your email by clicking this link:\n${verifyLink}\n\nThis link expires in 24 hours.`,
    html: `
      <p>Hi ${name},</p>
      <p>Welcome to CollabHub! Please verify your email by clicking the button below:</p>
      <p><a href="${verifyLink}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">Verify Email</a></p>
      <p>Or copy this link: <a href="${verifyLink}">${verifyLink}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
};
