import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  deleteNotificationsForUser,
  listNotificationsForUser,
  markNotificationsReadForUser,
} from '../services/storage.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const notifications = await listNotificationsForUser(req.auth.userId);
  const unreadCount = notifications.filter((n) => !n.read).length;
  return res.json({ notifications, unreadCount });
});

router.post('/read', async (req, res) => {
  await markNotificationsReadForUser(req.auth.userId);
  return res.json({ ok: true });
});

router.delete('/', async (req, res) => {
  await deleteNotificationsForUser(req.auth.userId);
  return res.json({ ok: true });
});

export default router;
