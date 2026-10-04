import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import {
  deleteConversationById,
  findConversationBetweenUsers,
  findConversationById,
  findProfileByUserId,
  findUserById,
  listConversationsForUser,
  searchUsers,
  upsertConversation,
} from '../services/storage.js';
import { emitToUsers } from '../services/socketHub.js';
import { notifyUsers } from '../services/notificationService.js';

const router = express.Router();

const mapConversationForUser = async (conversation, currentUserId) => {
  const otherUserId = conversation.participants.find((id) => id !== currentUserId) || currentUserId;
  const [otherUser, otherProfile] = await Promise.all([
    findUserById(otherUserId),
    findProfileByUserId(otherUserId),
  ]);

  return {
    id: conversation.id,
    participants: conversation.participants,
    unreadBy: conversation.unreadBy || {},
    partner: {
      id: otherUserId,
      name: otherUser?.name || otherProfile?.name || 'User',
      initials: otherProfile?.initials || String(otherUser?.name || 'U').slice(0, 1).toUpperCase(),
      avatar: otherProfile?.avatar || null,
      email: otherUser?.email || '',
    },
    lastMessage: conversation.lastMessage || '',
    updatedAt: conversation.updatedAt,
    unread: Number(conversation.unreadBy?.[currentUserId] || 0),
    favorite: Boolean(conversation.favoriteBy?.[currentUserId]),
    messages: conversation.messages || [],
  };
};

router.use(requireAuth);

router.get('/users', async (req, res) => {
  const q = req.query.q || '';
  const users = await searchUsers({ q, excludeUserId: req.auth.userId, limit: 20 });

  const payload = await Promise.all(users.map(async (u) => {
    const profile = await findProfileByUserId(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      initials: profile?.initials || String(u.name || 'U').slice(0, 1).toUpperCase(),
      avatar: profile?.avatar || null,
      usn: profile?.usn || '',
      dept: profile?.dept || 'Student',
      year: profile?.year || '',
      bio: profile?.bio || '',
      skills: Array.isArray(profile?.skills) ? profile.skills : [],
      matchScore: profile?.matchScore ?? null,
    };
  }));

  return res.json({ users: payload });
});

router.get('/conversations', async (req, res) => {
  const raw = await listConversationsForUser(req.auth.userId);
  const conversations = await Promise.all(raw.map((c) => mapConversationForUser(c, req.auth.userId)));
  const unreadTotal = conversations.reduce((sum, c) => sum + Number(c.unread || 0), 0);
  return res.json({ conversations, unreadTotal });
});

router.post('/conversations', async (req, res) => {
  const { otherUserId } = req.body || {};
  if (!otherUserId || otherUserId === req.auth.userId) {
    return res.status(400).json({ error: 'Valid otherUserId is required.' });
  }

  const otherUser = await findUserById(otherUserId);
  if (!otherUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  let conversation = await findConversationBetweenUsers(req.auth.userId, otherUserId);
  if (!conversation) {
    conversation = {
      id: uuidv4(),
      participants: [req.auth.userId, otherUserId],
      messages: [],
      unreadBy: { [req.auth.userId]: 0, [otherUserId]: 0 },
      lastMessage: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await upsertConversation(conversation);
  }

  const mapped = await mapConversationForUser(conversation, req.auth.userId);
  return res.status(201).json({ conversation: mapped });
});

const MAX_MESSAGE_LENGTH = 4000;

router.post('/send', async (req, res) => {
  const { conversationId, text } = req.body || {};
  const trimmed = String(text || '').trim();
  if (!conversationId || !trimmed) {
    return res.status(400).json({ error: 'conversationId and text are required.' });
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` });
  }

  const conversation = await findConversationById(conversationId);
  if (!conversation || !conversation.participants.includes(req.auth.userId)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const message = {
    id: uuidv4(),
    from: req.auth.userId,
    text: trimmed,
    createdAt: new Date().toISOString(),
  };

  const next = {
    ...conversation,
    messages: [...(conversation.messages || []), message],
    lastMessage: message.text,
    updatedAt: message.createdAt,
    unreadBy: {
      ...(conversation.unreadBy || {}),
    },
  };

  next.participants.forEach((id) => {
    next.unreadBy[id] = id === req.auth.userId
      ? 0
      : Number(next.unreadBy[id] || 0) + 1;
  });

  await upsertConversation(next);

  const forSender = await mapConversationForUser(next, req.auth.userId);

  emitToUsers(next.participants, 'message:new', {
    conversationId: next.id,
    message,
    updatedAt: next.updatedAt,
  });

  const recipients = next.participants.filter((id) => id !== req.auth.userId);
  const sender = await findUserById(req.auth.userId);
  await notifyUsers(recipients, {
    type: 'message',
    text: `New message from ${sender?.name || 'a user'}`,
    actorUserId: req.auth.userId,
  });

  return res.status(201).json({
    message,
    conversation: forSender,
  });
});

router.post('/:id/read', async (req, res) => {
  const conversation = await findConversationById(req.params.id);
  if (!conversation || !conversation.participants.includes(req.auth.userId)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const next = {
    ...conversation,
    unreadBy: {
      ...(conversation.unreadBy || {}),
      [req.auth.userId]: 0,
    },
  };

  await upsertConversation(next);
  emitToUsers(next.participants, 'conversation:read', {
    conversationId: next.id,
    userId: req.auth.userId,
  });

  return res.json({ ok: true });
});

router.post('/:id/favorite', async (req, res) => {
  const conversation = await findConversationById(req.params.id);
  if (!conversation || !conversation.participants.includes(req.auth.userId)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const nextFavorite = !Boolean(conversation.favoriteBy?.[req.auth.userId]);
  const next = {
    ...conversation,
    favoriteBy: {
      ...(conversation.favoriteBy || {}),
      [req.auth.userId]: nextFavorite,
    },
    updatedAt: conversation.updatedAt || new Date().toISOString(),
  };

  await upsertConversation(next);
  const mapped = await mapConversationForUser(next, req.auth.userId);

  emitToUsers(next.participants, 'conversation:updated', {
    conversationId: next.id,
  });

  return res.json({ conversation: mapped, favorite: nextFavorite });
});

router.delete('/:id/messages/:messageId', async (req, res) => {
  const conversation = await findConversationById(req.params.id);
  if (!conversation || !conversation.participants.includes(req.auth.userId)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const before = conversation.messages || [];
  const message = before.find((m) => m.id === req.params.messageId);
  if (!message) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  if (message.from !== req.auth.userId) {
    return res.status(403).json({ error: 'You can only delete your own messages.' });
  }

  const messages = before.filter((m) => m.id !== req.params.messageId);
  const lastMessage = messages.length > 0 ? String(messages[messages.length - 1].text || '') : '';
  const next = {
    ...conversation,
    messages,
    lastMessage,
    updatedAt: new Date().toISOString(),
  };

  await upsertConversation(next);
  const mapped = await mapConversationForUser(next, req.auth.userId);

  emitToUsers(next.participants, 'conversation:updated', {
    conversationId: next.id,
  });

  return res.json({ conversation: mapped, deletedMessageId: req.params.messageId });
});

router.delete('/:id', async (req, res) => {
  const conversation = await findConversationById(req.params.id);
  if (!conversation || !conversation.participants.includes(req.auth.userId)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  await deleteConversationById(conversation.id);

  emitToUsers(conversation.participants, 'conversation:deleted', {
    conversationId: conversation.id,
    clearedBy: req.auth.userId,
  });

  return res.json({ ok: true, deletedConversationId: conversation.id });
});

export default router;
