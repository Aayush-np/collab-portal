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
