import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import {
  findConnectionRequestById,
  findConversationBetweenUsers,
  findLatestConnectionBetweenUsers,
  findProfileByUserId,
  findUserById,
  listAcceptedConnectionsForUser,
  listConnectionRequestsForUser,
  saveConnectionRequest,
  upsertConversation,
} from '../services/storage.js';
import { emitToUsers } from '../services/socketHub.js';
import { notifyUsers } from '../services/notificationService.js';

const router = express.Router();
router.use(requireAuth);

const asUserSummary = async (userId) => {
  const [user, profile] = await Promise.all([
    findUserById(userId),
    findProfileByUserId(userId),
  ]);

  return {
    id: userId,
    name: user?.name || profile?.name || 'User',
    email: user?.email || profile?.email || '',
    initials: profile?.initials || String(user?.name || 'U').slice(0, 1).toUpperCase(),
    avatar: profile?.avatar || null,
  };
};

const enrichRequest = async (request, currentUserId) => {
  const isIncoming = request.toUserId === currentUserId;
  const counterpartId = isIncoming ? request.fromUserId : request.toUserId;
  const counterpart = await asUserSummary(counterpartId);

  return {
    ...request,
    direction: isIncoming ? 'incoming' : 'outgoing',
    counterpart,
  };
};

const emitConnectionChange = async ({ request, event, actorUserId }) => {
  const payload = {
    requestId: request.id,
    status: request.status,
    fromUserId: request.fromUserId,
    toUserId: request.toUserId,
    actorUserId,
    updatedAt: request.updatedAt,
  };

  const [fromUser, toUser] = await Promise.all([
    asUserSummary(request.fromUserId),
    asUserSummary(request.toUserId),
  ]);

  emitToUsers([request.fromUserId, request.toUserId], event, {
    ...payload,
    fromUser,
    toUser,
  });

  emitToUsers([request.fromUserId, request.toUserId], 'connections:changed', payload);
};

const pairKey = (a, b) => [String(a || ''), String(b || '')].sort().join('::');

router.get('/summary', async (req, res) => {
  const userId = req.auth.userId;
  const [incomingPending, outgoingPending, accepted] = await Promise.all([
    listConnectionRequestsForUser(userId, { type: 'incoming', status: 'pending' }),
    listConnectionRequestsForUser(userId, { type: 'outgoing', status: 'pending' }),
    listAcceptedConnectionsForUser(userId),
  ]);

  const connectedUserIds = accepted.map((request) => (
    request.fromUserId === userId ? request.toUserId : request.fromUserId
  ));

  return res.json({
    incomingCount: incomingPending.length,
    outgoingCount: outgoingPending.length,
    connectedCount: connectedUserIds.length,
    incomingFromUserIds: incomingPending.map((r) => r.fromUserId),
    outgoingToUserIds: outgoingPending.map((r) => r.toUserId),
    connectedUserIds,
  });
});

router.get('/requests', async (req, res) => {
  const type = String(req.query.type || 'incoming');
  const status = req.query.status ? String(req.query.status) : undefined;

  const requests = await listConnectionRequestsForUser(req.auth.userId, { type, status });
  const enriched = await Promise.all(requests.map((request) => enrichRequest(request, req.auth.userId)));

  return res.json({ requests: enriched });
});

router.get('/connected', async (req, res) => {
  const userId = req.auth.userId;
  const accepted = await listAcceptedConnectionsForUser(userId);
  const people = await Promise.all(accepted.map(async (request) => {
    const otherUserId = request.fromUserId === userId ? request.toUserId : request.fromUserId;
    const counterpart = await asUserSummary(otherUserId);
    return {
      ...counterpart,
      connectedAt: request.updatedAt,
    };
  }));

  return res.json({ people });
});

router.post('/request', async (req, res) => {
  const fromUserId = req.auth.userId;
  const toUserId = String(req.body?.toUserId || '').trim();

  if (!toUserId || toUserId === fromUserId) {
    return res.status(400).json({ error: 'Valid target user is required.' });
  }

  const targetUser = await findUserById(toUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  const latest = await findLatestConnectionBetweenUsers(fromUserId, toUserId);
  if (latest?.status === 'accepted') {
    return res.status(400).json({ error: 'You are already connected.' });
  }

  if (latest?.status === 'pending') {
    if (latest.fromUserId === fromUserId) {
      const enriched = await enrichRequest(latest, fromUserId);
      return res.json({ request: enriched, alreadyPending: true });
    }

    return res.status(400).json({ error: 'This user has already sent you a request. Check your Requests.' });
  }

  const now = new Date().toISOString();
  const request = await saveConnectionRequest({
    id: uuidv4(),
    pairKey: pairKey(fromUserId, toUserId),
    fromUserId,
    toUserId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  const enriched = await enrichRequest(request, fromUserId);
  await emitConnectionChange({ request, event: 'connection:request:new', actorUserId: fromUserId });

  const fromUser = await findUserById(fromUserId);
  await notifyUsers([toUserId], {
    type: 'connection',
    text: `${fromUser?.name || 'Someone'} sent you a connection request`,
    actorUserId: fromUserId,
  });

  return res.status(201).json({ request: enriched });
});

router.post('/requests/:id/accept', async (req, res) => {
  const request = await findConnectionRequestById(req.params.id);
  if (!request || request.toUserId !== req.auth.userId) {
    return res.status(404).json({ error: 'Request not found.' });
  }

  if (request.status === 'accepted') {
    const enriched = await enrichRequest(request, req.auth.userId);
    return res.json({ request: enriched, alreadyAccepted: true });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending requests can be accepted.' });
  }

  const updated = await saveConnectionRequest({
    ...request,
    status: 'accepted',
    updatedAt: new Date().toISOString(),
  });

  const enriched = await enrichRequest(updated, req.auth.userId);
  await emitConnectionChange({ request: updated, event: 'connection:request:updated', actorUserId: req.auth.userId });

  // New connection: create an empty chat so both users can start messaging
  // straight away from the Messages page.
  const existingConversation = await findConversationBetweenUsers(updated.fromUserId, updated.toUserId);
  if (!existingConversation) {
    const now = new Date().toISOString();
    await upsertConversation({
      id: uuidv4(),
      participants: [updated.fromUserId, updated.toUserId],
      messages: [],
      unreadBy: { [updated.fromUserId]: 0, [updated.toUserId]: 0 },
      lastMessage: 'New connection — say hi 👋',
      createdAt: now,
      updatedAt: now,
    });
  }

  const acceptor = await findUserById(req.auth.userId);
  await notifyUsers([updated.fromUserId], {
    type: 'connection',
    text: `${acceptor?.name || 'Someone'} accepted your connection request`,
    actorUserId: req.auth.userId,
  });

  return res.json({ request: enriched });
});

router.post('/requests/:id/reject', async (req, res) => {
  const request = await findConnectionRequestById(req.params.id);
  if (!request || request.toUserId !== req.auth.userId) {
    return res.status(404).json({ error: 'Request not found.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending requests can be rejected.' });
  }

  const updated = await saveConnectionRequest({
    ...request,
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  });

  const enriched = await enrichRequest(updated, req.auth.userId);
  await emitConnectionChange({ request: updated, event: 'connection:request:updated', actorUserId: req.auth.userId });

  const rejector = await findUserById(req.auth.userId);
  await notifyUsers([updated.fromUserId], {
    type: 'connection',
    text: `${rejector?.name || 'Someone'} declined your connection request`,
    actorUserId: req.auth.userId,
  });

  return res.json({ request: enriched });
});

export default router;
