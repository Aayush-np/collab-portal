import jwt from 'jsonwebtoken';
import { findUserById } from '../services/authService.js';

const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || 'replace-me-in-env';

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing token.' });
  }

  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (payload?.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type.' });
    }

    const user = await findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token user.' });
    }
    req.auth = { userId: user.id, role: user.role || 'user' };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

export const requireAdmin = (req, res, next) => {
  const role = req.auth?.role || 'user';
  if (!['superadmin', 'editor-admin', 'support-admin', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  return next();
};

const rolePermissions = {
  superadmin: new Set(['admin.read', 'admin.edit', 'admin.security', 'admin.delete', 'admin.roles']),
  'editor-admin': new Set(['admin.read', 'admin.edit']),
  'support-admin': new Set(['admin.read', 'admin.security']),
  admin: new Set(['admin.read', 'admin.security']),
};

export const requirePermission = (permission) => (req, res, next) => {
  const role = req.auth?.role || 'user';
  const allowed = rolePermissions[role] || new Set();
  if (!allowed.has(permission)) {
    return res.status(403).json({ error: 'Insufficient admin permission.' });
  }
  return next();
};
