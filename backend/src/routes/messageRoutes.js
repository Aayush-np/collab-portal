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

const toInitials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CH';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const asChatMember = async (userId) => {
  const [user, profile] = await Promise.all([
    findUserById(userId),
    findProfileByUserId(userId),
  ]);
  return {
    id: userId,
    name: user?.name || profile?.name || 'User',
    email: user?.email || '',
    initials: profile?.initials || toInitials(user?.name),
    avatar: profile?.avatar || null,
  };
};

const mapConversationForUser = async (conversation, currentUserId) => {
  // Group chats (project teams): "partner" represents the group itself.
  if (conversation.isGroup) {
    const members = await Promise.all(
      (conversation.participants || []).map((id) => asChatMember(id))
    );
    const name = conversation.name || 'Group';

    return {
      id: conversation.id,
      participants: conversation.participants,
      unreadBy: conversation.unreadBy || {},
      isGroup: true,
      name,
      ownerId: conversation.ownerId || null,
      ideaId: conversation.ideaId || null,
      partner: {
        id: conversation.id,
        name,
        initials: toInitials(name),
        avatar: null,
        email: '',
        isGroup: true,
      },
      members,
      lastMessage: conversation.lastMessage || '',
      updatedAt: conversation.updatedAt,
      unread: Number(conversation.unreadBy?.[currentUserId] || 0),
      favorite: Boolean(conversation.favoriteBy?.[currentUserId]),
      messages: conversation.messages || [],
    };
  }

  // Direct messages.
  const otherUserId = conversation.participants.find((id) => id !== currentUserId) || currentUserId;
  const otherUser = await asChatMember(otherUserId);

  return {
    id: conversation.id,
    participants: conversation.participants,
    unreadBy: conversation.unreadBy || {},
    isGroup: false,
    name: null,
    ownerId: null,
    ideaId: null,
    partner: {
      id: otherUserId,
      name: otherUser.name,
      initials: otherUser.initials,
      avatar: otherUser.avatar,
      email: otherUser.email,
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

// Rename a group chat — only the project owner (group creator) may do this.
router.put('/:id/name', async (req, res) => {
  const conversation = await findConversationById(req.params.id);
  if (!conversation || !conversation.participants.includes(req.auth.userId)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  if (!conversation.isGroup) {
    return res.status(400).json({ error: 'Only group chats can be renamed.' });
  }

  if (conversation.ownerId !== req.auth.userId) {
    return res.status(403).json({ error: 'Only the project owner can rename this group.' });
  }

  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) {
    return res.status(400).json({ error: 'Group name is required.' });
  }

  const next = {
    ...conversation,
    name,
    updatedAt: new Date().toISOString(),
  };

  await upsertConversation(next);
  const mapped = await mapConversationForUser(next, req.auth.userId);

  emitToUsers(next.participants, 'conversation:updated', {
    conversationId: next.id,
    name,
  });

  return res.json({ conversation: mapped });
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

  // Group chats belong to the project team — only the owner can delete them.
  if (conversation.isGroup && conversation.ownerId !== req.auth.userId) {
    return res.status(403).json({ error: 'Only the project owner can delete this group chat.' });
  }

  await deleteConversationById(conversation.id);

  emitToUsers(conversation.participants, 'conversation:deleted', {
    conversationId: conversation.id,
    clearedBy: req.auth.userId,
  });

  return res.json({ ok: true, deletedConversationId: conversation.id });
});

export default router;
