import express from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { requireAdmin, requireAuth, requirePermission } from '../middleware/auth.js';
import {
  addAuditLog,
  deleteUserById,
  findUserByEmail,
  findProfileByUserId,
  findUserById,
  listAuditLogs,
  listPasswordResetTokens,
  listProfiles,
  listRefreshTokens,
  listUsers,
  queryUsers,
  revokeAllRefreshTokensForUser,
  updateUser,
  upsertProfile,
} from '../services/storage.js';

const router = express.Router();

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  provider: user.provider,
  role: user.role || 'user',
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

router.use(requireAuth, requireAdmin);

const sanitizeRole = (role) => {
  if (role === 'superadmin' || role === 'editor-admin' || role === 'support-admin' || role === 'user') {
    return role;
  }
  return 'user';
};

const writeAudit = async (req, action, targetUserId, details = {}) => {
  await addAuditLog({
    id: uuidv4(),
    actorId: req.auth.userId,
    actorRole: req.auth.role,
    action,
    targetUserId,
    details,
    createdAt: new Date().toISOString(),
  });
};

router.get('/overview', requirePermission('admin.read'), async (req, res) => {
  const [users, profiles, refreshTokens, passwordResetTokens] = await Promise.all([
    listUsers(),
    listProfiles(),
    listRefreshTokens(),
    listPasswordResetTokens(),
  ]);

  const now = Date.now();
  const activeTokens = refreshTokens.filter((token) => new Date(token.expiresAt).getTime() > now);
  const activeSessionUsers = new Set(activeTokens.map((token) => token.userId));
  const mySessionCount = activeTokens.filter((token) => token.userId === req.auth.userId).length;

  return res.json({
    stats: {
      users: users.length,
      profiles: Object.keys(profiles).length,
      refreshTokens: activeTokens.length,
      activeSessions: mySessionCount > 0 ? 1 : 0,
      totalActiveUsers: activeSessionUsers.size,
      passwordResetTokens: passwordResetTokens.length,
      admins: users.filter((u) => ['superadmin', 'editor-admin', 'support-admin', 'admin'].includes(u.role || 'user')).length,
    },
  });
});

router.get('/users', requirePermission('admin.read'), async (req, res) => {
  const { page = 1, limit = 10, search = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  const result = await queryUsers({ page, limit, search, sortBy, sortOrder });
  return res.json({
    ...result,
    users: result.users.map(sanitizeUser),
  });
});

router.get('/profiles', requirePermission('admin.read'), async (_req, res) => {
  const profiles = await listProfiles();
  return res.json({ profiles });
});

router.get('/audit-logs', requirePermission('admin.read'), async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const [result, users] = await Promise.all([
    listAuditLogs({ page, limit }),
    listUsers(),
  ]);

  const userMap = new Map(users.map((user) => [user.id, user]));
  const logs = (result.logs || []).map((log) => ({
    ...log,
    actorName: userMap.get(log.actorId)?.name || 'Unknown user',
    actorEmail: userMap.get(log.actorId)?.email || '',
    targetName: userMap.get(log.targetUserId)?.name || null,
    targetEmail: userMap.get(log.targetUserId)?.email || '',
  }));

  return res.json({
    ...result,
    logs,
  });
});

router.put('/users/:id', requirePermission('admin.edit'), async (req, res) => {
  const targetId = req.params.id;
  const current = await findUserById(targetId);
  if (!current) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const payload = req.body || {};
  const nextRole = sanitizeRole(payload.role ?? current.role);
  const changingRole = nextRole !== (current.role || 'user');
  if (changingRole && req.auth.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can change roles.' });
  }

  const updates = {
    name: typeof payload.name === 'string' ? payload.name.trim().slice(0, 80) : current.name,
    email: current.email,
    role: nextRole,
    provider: payload.provider === 'google' ? 'google' : (payload.provider === 'local' ? 'local' : current.provider),
    updatedAt: new Date().toISOString(),
  };

  if (typeof payload.email === 'string' && payload.email.trim()) {
    const nextEmail = payload.email.trim().toLowerCase().slice(0, 200);
    if (!/.+@.+\..+/.test(nextEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email.' });
    }
    const taken = await findUserByEmail(nextEmail);
    if (taken && taken.id !== targetId) {
      return res.status(409).json({ error: 'Email already in use.' });
    }
    updates.email = nextEmail;
  }

  const updated = await updateUser(targetId, updates);
  await writeAudit(req, 'user.update', targetId, { changedRole: changingRole });
  return res.json({ user: sanitizeUser(updated) });
});

router.put('/profiles/:id', requirePermission('admin.edit'), async (req, res) => {
  const targetId = req.params.id;
  const current = await findProfileByUserId(targetId);
  if (!current) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  const payload = req.body || {};
  const next = {
    ...current,
    ...payload,
    id: current.id,
  };

  await upsertProfile(targetId, next);
  await writeAudit(req, 'profile.update', targetId, { keys: Object.keys(payload || {}) });
  return res.json({ profile: next });
});

router.post('/users/:id/password', requirePermission('admin.security'), async (req, res) => {
  const targetId = req.params.id;
  const { newPassword } = req.body || {};

  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const current = await findUserById(targetId);
  if (!current) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  await updateUser(targetId, {
    passwordHash,
    provider: current.provider === 'google' ? 'local' : current.provider,
    updatedAt: new Date().toISOString(),
  });
  await revokeAllRefreshTokensForUser(targetId);
  await writeAudit(req, 'user.password.reset', targetId);

  return res.json({ ok: true });
});

router.delete('/users/:id', requirePermission('admin.delete'), async (req, res) => {
  const targetId = req.params.id;

  if (targetId === req.auth.userId) {
    return res.status(400).json({ error: 'Admin cannot delete their own account here.' });
  }

  const current = await findUserById(targetId);
  if (!current) {
    return res.status(404).json({ error: 'User not found.' });
  }

  await deleteUserById(targetId);
  await writeAudit(req, 'user.delete', targetId);
  return res.json({ ok: true });
});

router.post('/users/:id/revoke-sessions', requirePermission('admin.security'), async (req, res) => {
  const targetId = req.params.id;
  const current = await findUserById(targetId);
  if (!current) {
    return res.status(404).json({ error: 'User not found.' });
  }

  await revokeAllRefreshTokensForUser(targetId);
  await writeAudit(req, 'user.sessions.revoke', targetId);
  return res.json({ ok: true });
});

export default router;
