import { v4 as uuidv4 } from 'uuid';
import { createNotification } from './storage.js';
import { emitToUsers } from './socketHub.js';

// Create a notification for each user and push it in real time.
// `text` should already include the actor's name; `actorUserId` lets the
// frontend deep-link (e.g. open the chat with that user).
export const notifyUsers = async (userIds, { type, text, actorUserId = null }) => {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  if (unique.length === 0) return;

  const createdAt = new Date().toISOString();

  await Promise.all(unique.map(async (userId) => {
    const notification = await createNotification({
      id: uuidv4(),
      userId,
      type,
      text,
      actorUserId,
      createdAt,
      read: false,
    });
    emitToUsers([userId], 'notification:new', notification);
  }));
};
