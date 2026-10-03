import express from 'express';
import {
  getSessionForUser,
  loginUser,
  loginWithGoogle,
  logoutSession,
  refreshSession,
  registerWithVerification,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyEmail,
} from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

const validateEmail = (email) => /.+@.+\..+/.test(String(email || '').trim());

// Throttle credential-facing endpoints against brute-force / signup spam.
const authLimiter = rateLimit({ windowMs: 60_000, max: 20, message: 'Too many attempts. Please wait a minute and try again.' });
const credentialLimiter = rateLimit({ windowMs: 60_000, max: 10, message: 'Too many attempts. Please wait a minute and try again.' });

// Optional Cloudflare Turnstile: enforced only when TURNSTILE_SECRET_KEY is configured.
const verifyCaptcha = async (req, res, next) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return next();

  const token = req.body?.captchaToken;
  if (!token) {
    return res.status(400).json({ error: 'CAPTCHA verification required.' });
  }

  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await resp.json();
    if (!data?.success) {
      return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
    }
    return next();
  } catch {
    return res.status(503).json({ error: 'CAPTCHA service unavailable. Please try again later.' });
  }
};

router.post('/register', authLimiter, verifyCaptcha, async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Please provide a valid email.' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const result = await registerWithVerification({ name, email, password });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not create account.' });
  }
});

router.post('/verify-email', async (req, res) => {
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'Verification token is required.' });
  }
  try {
    const result = await verifyEmail({ token });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Verification failed.' });
  }
});

router.post('/login', credentialLimiter, verifyCaptcha, async (req, res) => {
  const { email, password } = req.body || {};

  if (!validateEmail(email) || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const session = await loginUser({ email, password });
    return res.json(session);
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Login failed.' });
  }
});

router.post('/google', async (req, res) => {
  if (process.env.ENABLE_GOOGLE_AUTH !== '1') {
    return res.status(400).json({ error: 'Google auth is disabled.' });
  }

  const { idToken } = req.body || {};

  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required.' });
  }

  try {
    const session = await loginWithGoogle({ idToken });
    return res.json(session);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Google login failed.' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required.' });
  }

  try {
    const session = await refreshSession({ refreshToken });
    return res.json(session);
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Could not refresh session.' });
  }
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body || {};
  await logoutSession({ refreshToken });
  return res.json({ ok: true });
});

router.post('/forgot-password', credentialLimiter, verifyCaptcha, async (req, res) => {
  const { email } = req.body || {};
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Please provide a valid email.' });
  }

  try {
    const result = await requestPasswordReset({ email });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not start password reset.' });
  }
});

router.post('/reset-password', credentialLimiter, async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Valid reset token and new password are required.' });
  }

  try {
    const result = await resetPasswordWithToken({ token, newPassword });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not reset password.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const session = await getSessionForUser(req.auth.userId);
    return res.json(session);
  } catch (error) {
    return res.status(404).json({ error: error.message || 'Session not found.' });
  }
});

export default router;
