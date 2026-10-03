import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import {
  consumePasswordResetToken,
  consumeRefreshToken,
  createPasswordResetToken,
  findProfileByUserId,
  findUserByEmail,
  findUserByGoogleIdOrEmail,
  findUserById as findUserByIdFromStorage,
  insertUser,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  storeRefreshToken,
  updateUser,
  upsertProfile,
} from './storage.js';
import { createDefaultProfile, normalizeLegacyProfileDefaults } from './profileTemplate.js';
import { sendResetEmail } from './mailService.js';

const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || 'replace-me-in-env';
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || `${ACCESS_TOKEN_SECRET}-refresh`;
const REFRESH_TOKEN_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 30);
const RESET_TOKEN_EXPIRES_MINUTES = Number(process.env.RESET_TOKEN_EXPIRES_MINUTES || 20);
const VERIFICATION_TOKEN_EXPIRES_HOURS = Number(process.env.VERIFICATION_TOKEN_EXPIRES_HOURS || 24);
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

// Only CMRIT accounts are allowed (override via ALLOWED_EMAIL_DOMAIN in env).
const ALLOWED_EMAIL_DOMAIN = String(process.env.ALLOWED_EMAIL_DOMAIN || 'cmrit.ac.in').toLowerCase();
export const isAllowedEmailDomain = (email) =>
  String(email || '').trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
const assertAllowedEmail = (email) => {
  if (!isAllowedEmailDomain(email)) {
    throw new Error(`Only @${ALLOWED_EMAIL_DOMAIN} email addresses are allowed on CollabHub.`);
  }
};

const adminEmails = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
const superadminEmails = new Set(
  String(process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
const editorAdminEmails = new Set(
  String(process.env.EDITOR_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
const supportAdminEmails = new Set(
  String(process.env.SUPPORT_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const roleForEmail = (email) => {
  const normalized = String(email || '').toLowerCase();
  if (superadminEmails.has(normalized)) return 'superadmin';
  if (editorAdminEmails.has(normalized)) return 'editor-admin';
  if (supportAdminEmails.has(normalized) || adminEmails.has(normalized)) return 'support-admin';
  return 'user';
};

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  provider: user.provider,
  role: user.role || 'user',
});

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const signAccessToken = (user) => jwt.sign(
  { sub: user.id, email: user.email, type: 'access' },
  ACCESS_TOKEN_SECRET,
  { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
);

const signRefreshToken = (user) => jwt.sign(
  { sub: user.id, email: user.email, type: 'refresh', jti: uuidv4() },
  REFRESH_TOKEN_SECRET,
  { expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d` }
);

const createSession = async (user, profile) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  // Keep one active refresh session per user to avoid stale session inflation.
  await revokeAllRefreshTokensForUser(user.id);

  await storeRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  });

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(user),
    profile,
  };
};

export const findUserById = async (id) => findUserByIdFromStorage(id);

export const registerWithVerification = async ({ name, email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  assertAllowedEmail(normalizedEmail);

  if (await findUserByEmail(normalizedEmail)) {
    throw new Error('Email already in use.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = uuidv4();
  const user = {
    id: uuidv4(),
    name: String(name || '').trim(),
    email: normalizedEmail,
    passwordHash,
    provider: 'local',
    role: roleForEmail(normalizedEmail),
    googleId: null,
    emailVerified: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await insertUser(user);
  const profile = normalizeLegacyProfileDefaults(createDefaultProfile({ userId: user.id, name: user.name, email: user.email }));
  await upsertProfile(user.id, profile);

  const verificationToken = crypto.randomBytes(32).toString('hex');
  await createVerificationToken({
    userId,
    tokenHash: hashToken(verificationToken),
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRES_HOURS * 60 * 60 * 1000).toISOString(),
  });

  await sendVerificationEmail({ toEmail: normalizedEmail, verificationToken, name: user.name });

  return { ok: true, requiresVerification: true, email: normalizedEmail };
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  assertAllowedEmail(normalizedEmail);
  const user = await findUserByEmail(normalizedEmail);

  if (!user || !user.passwordHash) {
    throw new Error('Invalid email or password.');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new Error('Invalid email or password.');
  }

  if (user.emailVerified === false) {
    throw new Error('Please verify your email before logging in. Check your inbox for the verification link.');
  }

  const rawProfile = (await findProfileByUserId(user.id)) || createDefaultProfile({ userId: user.id, name: user.name, email: user.email });
  const profile = normalizeLegacyProfileDefaults(rawProfile);
  await upsertProfile(user.id, profile);
  return createSession(user, profile);
};

export const loginWithGoogle = async ({ idToken }) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Google auth is not configured on the server.');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error('Unable to verify Google account.');
  }

  const email = payload.email.toLowerCase();
  assertAllowedEmail(email);
  let user = await findUserByGoogleIdOrEmail({ email, googleId: payload.sub });

  if (!user) {
    user = {
      id: uuidv4(),
      name: payload.name || payload.email.split('@')[0],
      email,
      passwordHash: null,
      provider: 'google',
      role: roleForEmail(email),
      googleId: payload.sub,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await insertUser(user);
  } else {
    user = await updateUser(user.id, {
      provider: 'google',
      googleId: payload.sub,
      role: user.role || roleForEmail(email),
      name: user.name || payload.name || email.split('@')[0],
      updatedAt: new Date().toISOString(),
    });
  }

  const profile = normalizeLegacyProfileDefaults(
    (await findProfileByUserId(user.id)) || createDefaultProfile({ userId: user.id, name: user.name, email: user.email })
  );
  if (payload.picture && !profile.avatar) {
    profile.avatar = payload.picture;
  }
  await upsertProfile(user.id, profile);

  return createSession(user, profile);
};

export const refreshSession = async ({ refreshToken }) => {
  let payload;
  try {
    payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
  } catch {
    throw new Error('Invalid or expired refresh token.');
  }

  if (payload?.type !== 'refresh') {
    throw new Error('Invalid refresh token type.');
  }

  const consumed = await consumeRefreshToken(hashToken(refreshToken));
  if (!consumed) {
    throw new Error('Refresh token was already used or expired.');
  }

  const user = await findUserByIdFromStorage(payload.sub);
  if (!user) {
    throw new Error('User not found.');
  }

  const profile = normalizeLegacyProfileDefaults(
    (await findProfileByUserId(user.id)) || createDefaultProfile({ userId: user.id, name: user.name, email: user.email })
  );
  await upsertProfile(user.id, profile);

  return createSession(user, profile);
};

export const logoutSession = async ({ refreshToken }) => {
  if (!refreshToken) return;
  await revokeRefreshToken(hashToken(refreshToken));
};

export const requestPasswordReset = async ({ email }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    return { ok: true };
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  await createPasswordResetToken({
    userId: user.id,
    tokenHash: hashToken(resetToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000).toISOString(),
  });

  await sendResetEmail({ toEmail: user.email, resetToken });

  const response = { ok: true };
  if (process.env.NODE_ENV !== 'production') {
    response.devResetToken = resetToken;
  }
  return response;
};

export const resetPasswordWithToken = async ({ token, newPassword }) => {
  const consumed = await consumePasswordResetToken(hashToken(token));
  if (!consumed) {
    throw new Error('Invalid or expired reset token.');
  }

  const user = await findUserByIdFromStorage(consumed.userId);
  if (!user) {
    throw new Error('User not found.');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await updateUser(user.id, {
    passwordHash,
    provider: 'local',
    updatedAt: new Date().toISOString(),
  });

  return { ok: true };
};

export const createVerificationToken = async ({ userId, tokenHash, expiresAt }) => {
  const payload = { userId, tokenHash, expiresAt };
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('verificationTokens').insertOne(payload);
    return;
  }
  const db = readJson();
  db.verificationTokens = db.verificationTokens || [];
  db.verificationTokens.push(payload);
  writeJson(db);
};

export const consumeVerificationToken = async (tokenHash) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const found = await db.collection('verificationTokens').findOne({ tokenHash }, { projection: { _id: 0 } });
    if (!found) return null;
    await db.collection('verificationTokens').deleteOne({ tokenHash });
    if (new Date(found.expiresAt).getTime() <= Date.now()) return null;
    return found;
  }
  const db = readJson();
  db.verificationTokens = db.verificationTokens || [];
  const found = db.verificationTokens.find((t) => t.tokenHash === tokenHash);
  if (!found) return null;
  db.verificationTokens = db.verificationTokens.filter((t) => t.tokenHash !== tokenHash);
  writeJson(db);
  if (new Date(found.expiresAt).getTime() <= Date.now()) return null;
  return found;
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

export const verifyEmail = async ({ token }) => {
  const consumed = await consumeVerificationToken(hashToken(token));
  if (!consumed) {
    throw new Error('Invalid or expired verification token.');
  }

  const user = await findUserByIdFromStorage(consumed.userId);
  if (!user) {
    throw new Error('User not found.');
  }

  await updateUser(user.id, { emailVerified: true, updatedAt: new Date().toISOString() });
  return { ok: true };
};

export const getSessionForUser = (userId) => {
  return Promise.resolve().then(async () => {
    const user = await findUserByIdFromStorage(userId);

    if (!user) {
      throw new Error('User not found.');
    }

    let profile = normalizeLegacyProfileDefaults(await findProfileByUserId(user.id));
    if (!profile) {
      profile = normalizeLegacyProfileDefaults(createDefaultProfile({ userId: user.id, name: user.name, email: user.email }));
    }
    await upsertProfile(user.id, profile);

    return {
      user: sanitizeUser(user),
      profile,
    };
  });
};
