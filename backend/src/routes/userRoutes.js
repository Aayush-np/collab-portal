import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { findProfileByUserId, upsertProfile } from '../services/storage.js';

const router = express.Router();

const clampPct = (value) => {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const toInitials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

router.get('/profile', requireAuth, async (req, res) => {
  const profile = await findProfileByUserId(req.auth.userId);

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  return res.json({ profile });
});

// Whitelist editable profile fields — never spread raw client input into storage.
const EDITABLE_TEXT_FIELDS = { name: 80, username: 60, usn: 20, dept: 80, year: 30, bio: 1000, github: 200, linkedin: 200, email: 200 };
const EDITABLE_IMAGE_FIELDS = { avatar: 600_000, banner: 900_000 };

router.put('/profile', requireAuth, async (req, res) => {
  const current = await findProfileByUserId(req.auth.userId);

  if (!current) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  const input = req.body || {};
  const skills = Array.isArray(input.skills)
    ? input.skills.map((s) => String(s || '').trim().slice(0, 40)).filter(Boolean).slice(0, 30)
    : current.skills;
  const levelsInput = input.skillLevels && typeof input.skillLevels === 'object' ? input.skillLevels : current.skillLevels;
  const skillLevels = Object.fromEntries(
    (skills || []).map((skill, i) => [
      skill,
      clampPct(levelsInput?.[skill] ?? Math.max(50, 80 - i * 5)),
    ])
  );
  const interests = Array.isArray(input.interests)
    ? input.interests.map((s) => String(s || '').trim().slice(0, 60)).filter(Boolean).slice(0, 20)
    : (current.interests || []);

  const updated = { ...current, skills, skillLevels, interests, id: current.id };

  for (const [field, max] of Object.entries(EDITABLE_TEXT_FIELDS)) {
    if (input[field] !== undefined) {
      updated[field] = String(input[field] ?? '').trim().slice(0, max);
    }
  }
  for (const [field, max] of Object.entries(EDITABLE_IMAGE_FIELDS)) {
    if (input[field] !== undefined && typeof input[field] === 'string' && input[field].length <= max) {
      updated[field] = input[field];
    }
  }

  updated.name = (updated.name || current.name || '').trim();
  updated.email = (updated.email || current.email || '').trim().toLowerCase();
  updated.initials = toInitials(updated.name) || current.initials;

  await upsertProfile(req.auth.userId, updated);

  return res.json({ profile: updated });
});

export default router;
