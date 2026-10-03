import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import {
  deleteIdeaById,
  findIdeaById,
  findProjectRequestById,
  findProfileByUserId,
  findUserById,
  findLatestProjectRequest,
  listProjectRequestsForUser,
  listAllIdeas,
  saveProjectRequest,
  saveIdea,
  updateIdeaById,
} from '../services/storage.js';
import { addAuditLog } from '../services/storage.js';
import { emitToUsers } from '../services/socketHub.js';

const router = express.Router();

// Server-side input caps (JSON body is also globally limited to 3mb in server.js).
const LIMITS = {
  title: 140,
  description: 4000,
  requirements: 2000,
  github: 200,
  deadline: 30,
  skillCount: 30,
  skillLength: 40,
  tagCount: 12,
  tagLength: 30,
};

const clampStr = (value, max) => String(value ?? '').slice(0, max);
const sanitizeStringList = (list, maxItems, maxLen) =>
  (Array.isArray(list) ? list : [])
    .map((item) => clampStr(item, maxLen).trim())
    .filter(Boolean)
    .slice(0, maxItems);
const sanitizeType = (type) => (type === 'internship' ? 'internship' : 'project');
const sanitizeTeamSize = (teamSize) => {
  const n = Number(teamSize);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(10, Math.round(n)));
};

const formatPosted = (iso) => {
  if (!iso) return 'Just now';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 'Just now';
  const diff = Date.now() - ts;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (diff < hour) return 'Just now';
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))}h ago`;
  return `${Math.max(1, Math.floor(diff / day))}d ago`;
};

const mapIdeaForClient = async (idea) => {
  const [author, profile] = await Promise.all([
    findUserById(idea.authorId),
    findProfileByUserId(idea.authorId),
  ]);

  return {
    ...idea,
    status: 'Recruiting',
    posted: formatPosted(idea.createdAt),
    currentMembers: Number(idea.currentMembers || 1),
    likes: Number(idea.likes || 0),
    comments: Number(idea.comments || 0),
    collaboratorIds: Array.isArray(idea.collaboratorIds) ? idea.collaboratorIds : [],
    author: {
      id: idea.authorId,
      name: author?.name || profile?.name || 'User',
      email: author?.email || '',
      initials: profile?.initials || String(author?.name || 'U').slice(0, 1).toUpperCase(),
      usn: profile?.usn || '',
    },
  };
};

const mapProjectRequestForClient = async (request, currentUserId) => {
  const isIncoming = request.toUserId === currentUserId;
  const counterpartId = isIncoming ? request.fromUserId : request.toUserId;
  const [otherUser, otherProfile, idea] = await Promise.all([
    findUserById(counterpartId),
    findProfileByUserId(counterpartId),
    findIdeaById(request.ideaId),
  ]);

  return {
    ...request,
    direction: isIncoming ? 'incoming' : 'outgoing',
    counterpart: {
      id: counterpartId,
      name: otherUser?.name || otherProfile?.name || 'User',
      email: otherUser?.email || '',
      initials: otherProfile?.initials || String(otherUser?.name || 'U').slice(0, 1).toUpperCase(),
    },
    idea: idea ? await mapIdeaForClient(idea) : null,
  };
};

router.use(requireAuth);

router.post('/', async (req, res) => {
  const { title, type, description, skills, tags, teamSize, deadline, github, requirements } = req.body || {};

  if (!title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'Title and description are required.' });
  }

  if (description.length < 50) {
    return res.status(400).json({ error: 'Description must be at least 50 characters.' });
  }

  if (!skills || !Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ error: 'At least one skill is required.' });
  }

  const idea = {
    id: uuidv4(),
    authorId: req.auth.userId,
    title: clampStr(title, LIMITS.title).trim(),
    type: sanitizeType(type),
    description: clampStr(description, LIMITS.description).trim(),
    skills: sanitizeStringList(skills, LIMITS.skillCount, LIMITS.skillLength),
    tags: sanitizeStringList(tags, LIMITS.tagCount, LIMITS.tagLength),
    teamSize: sanitizeTeamSize(teamSize),
    deadline: deadline ? clampStr(deadline, LIMITS.deadline) : null,
    github: github ? clampStr(github, LIMITS.github).trim() : null,
    requirements: requirements ? clampStr(requirements, LIMITS.requirements).trim() : null,
    currentMembers: 1,
    collaboratorIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveIdea(idea);
  const author = await findUserById(req.auth.userId);

  await addAuditLog({
    id: uuidv4(),
    action: 'idea.create',
    actorId: req.auth.userId,
    actorRole: author?.role || 'user',
    targetUserId: req.auth.userId,
    details: { type, title },
    createdAt: new Date().toISOString(),
  });

  const mapped = await mapIdeaForClient(idea);
  return res.status(201).json({ idea: mapped });
});

router.put('/:id', async (req, res) => {
  const existing = await findIdeaById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  if (existing.authorId !== req.auth.userId) {
    return res.status(403).json({ error: 'You can only edit your own posts.' });
  }

  const { title, type, description, skills, tags, teamSize, deadline, github, requirements } = req.body || {};

  if (!title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'Title and description are required.' });
  }

  if (description.length < 50) {
    return res.status(400).json({ error: 'Description must be at least 50 characters.' });
  }

  if (!skills || !Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ error: 'At least one skill is required.' });
  }

  const updated = await updateIdeaById(existing.id, {
    ...existing,
    title: clampStr(title, LIMITS.title).trim(),
    type: sanitizeType(type),
    description: clampStr(description, LIMITS.description).trim(),
    skills: sanitizeStringList(skills, LIMITS.skillCount, LIMITS.skillLength),
    tags: sanitizeStringList(tags, LIMITS.tagCount, LIMITS.tagLength),
    teamSize: sanitizeTeamSize(teamSize),
    deadline: deadline ? clampStr(deadline, LIMITS.deadline) : null,
    github: github ? clampStr(github, LIMITS.github).trim() : null,
    requirements: requirements ? clampStr(requirements, LIMITS.requirements).trim() : null,
    updatedAt: new Date().toISOString(),
  });

  await addAuditLog({
    id: uuidv4(),
    action: 'idea.update',
    actorId: req.auth.userId,
    actorRole: req.auth?.role || 'user',
    targetUserId: existing.authorId,
    details: { ideaId: existing.id, title: title.trim() },
    createdAt: new Date().toISOString(),
  });

  const mapped = await mapIdeaForClient(updated);
  return res.json({ idea: mapped });
});

router.get('/', async (_req, res) => {
  const ideas = await listAllIdeas();
  const mapped = await Promise.all(ideas.map((idea) => mapIdeaForClient(idea)));
  return res.json({ ideas: mapped });
});

router.delete('/:id', async (req, res) => {
  const idea = await findIdeaById(req.params.id);
  if (!idea) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  const role = req.auth?.role || 'user';
  const isAdmin = ['superadmin', 'editor-admin', 'support-admin', 'admin'].includes(role);
  const isOwner = idea.authorId === req.auth.userId;

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'You can only delete your own posts.' });
  }

  await deleteIdeaById(idea.id);

  await addAuditLog({
    id: uuidv4(),
    action: 'idea.delete',
    actorId: req.auth.userId,
    actorRole: role,
    targetUserId: idea.authorId,
    details: {
      ideaId: idea.id,
      title: idea.title,
      deletedBy: isAdmin && !isOwner ? 'admin' : 'owner',
    },
    createdAt: new Date().toISOString(),
  });

  return res.json({ ok: true });
});

router.post('/:id/request', async (req, res) => {
  const idea = await findIdeaById(req.params.id);
  if (!idea) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  if (idea.authorId === req.auth.userId) {
    return res.status(400).json({ error: 'You cannot apply to your own post.' });
  }

  const existing = await findLatestProjectRequest({ ideaId: idea.id, fromUserId: req.auth.userId });
  if (existing?.status === 'accepted') {
    return res.status(400).json({ error: 'You are already part of this project.' });
  }
  if (existing?.status === 'pending') {
    return res.json({ request: existing, alreadyPending: true });
  }

  const now = new Date().toISOString();
  const request = await saveProjectRequest({
    id: uuidv4(),
    ideaId: idea.id,
    fromUserId: req.auth.userId,
    toUserId: idea.authorId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  emitToUsers([idea.authorId], 'project:request:new', { ideaId: idea.id, requestId: request.id });

  return res.status(201).json({ request });
});

router.get('/requests', async (req, res) => {
  const type = String(req.query.type || 'incoming');
  const status = req.query.status ? String(req.query.status) : undefined;
  const requests = await listProjectRequestsForUser(req.auth.userId, { type, status });
  const mapped = await Promise.all(requests.map((request) => mapProjectRequestForClient(request, req.auth.userId)));
  return res.json({ requests: mapped });
});

router.post('/requests/:id/accept', async (req, res) => {
  const projectRequest = await findProjectRequestById(req.params.id);
  const idea = projectRequest ? await findIdeaById(projectRequest.ideaId) : null;

  if (!projectRequest || !idea || idea.authorId !== req.auth.userId) {
    return res.status(404).json({ error: 'Project request not found.' });
  }

  if (projectRequest.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending requests can be accepted.' });
  }

  const currentMembers = Number(idea.currentMembers || 1);
  const teamSize = Number(idea.teamSize || 1);
  if (currentMembers >= teamSize) {
    return res.status(400).json({ error: 'This project is already full.' });
  }

  const updatedRequest = await saveProjectRequest({
    ...projectRequest,
    status: 'accepted',
    updatedAt: new Date().toISOString(),
  });

  const updatedIdea = await updateIdeaById(idea.id, {
    ...idea,
    currentMembers: Math.min(teamSize, currentMembers + 1),
    collaboratorIds: Array.from(new Set([...(idea.collaboratorIds || []), projectRequest.fromUserId])),
    updatedAt: new Date().toISOString(),
  });

  emitToUsers([projectRequest.fromUserId, projectRequest.toUserId], 'project:request:updated', { requestId: updatedRequest.id, status: 'accepted', ideaId: idea.id });

  return res.json({ request: updatedRequest, idea: await mapIdeaForClient(updatedIdea) });
});

router.post('/requests/:id/reject', async (req, res) => {
  const projectRequest = await findProjectRequestById(req.params.id);
  const idea = projectRequest ? await findIdeaById(projectRequest.ideaId) : null;

  if (!projectRequest || !idea || idea.authorId !== req.auth.userId) {
    return res.status(404).json({ error: 'Project request not found.' });
  }

  if (projectRequest.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending requests can be rejected.' });
  }

  const updatedRequest = await saveProjectRequest({
    ...projectRequest,
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  });

  emitToUsers([projectRequest.fromUserId, projectRequest.toUserId], 'project:request:updated', { requestId: updatedRequest.id, status: 'rejected', ideaId: projectRequest.ideaId });

  return res.json({ request: updatedRequest });
});

export default router;
