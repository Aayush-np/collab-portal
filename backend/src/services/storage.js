import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { dataFilePath } from '../utils/paths.js';

// Escape user-controlled text before embedding it in a MongoDB regex (prevents ReDoS / invalid-regex 500s).
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const dbProvider = (process.env.DB_PROVIDER || (process.env.MONGODB_URI ? 'mongo' : 'json')).toLowerCase();
const mongoDbName = process.env.MONGODB_DB_NAME || 'collab_portal';

let mongoClient;
let mongoDb;

const ensureJsonDb = () => {
  const dir = path.dirname(dataFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataFilePath)) {
    const initial = {
      users: [],
      profiles: {},
      refreshTokens: [],
      passwordResetTokens: [],
      verificationTokens: [],
      notifications: [],
      conversations: [],
      connectionRequests: [],
      projectRequests: [],
      auditLogs: [],
      ideas: [],
    };
    fs.writeFileSync(dataFilePath, JSON.stringify(initial, null, 2), 'utf-8');
  }
};

const readJson = () => {
  ensureJsonDb();
  const parsed = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
  return {
    users: parsed.users || [],
    profiles: parsed.profiles || {},
    refreshTokens: parsed.refreshTokens || [],
    passwordResetTokens: parsed.passwordResetTokens || [],
    verificationTokens: parsed.verificationTokens || [],
    notifications: parsed.notifications || [],
    conversations: parsed.conversations || [],
    connectionRequests: parsed.connectionRequests || [],
    projectRequests: parsed.projectRequests || [],
    auditLogs: parsed.auditLogs || [],
    ideas: parsed.ideas || [],
  };
};

const writeJson = (data) => {
  ensureJsonDb();
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
};

const mongo = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required when DB_PROVIDER=mongo');
  }
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    mongoDb = mongoClient.db(mongoDbName);

    await Promise.all([
      mongoDb.collection('users').createIndex({ email: 1 }, { unique: true }),
      mongoDb.collection('users').createIndex({ googleId: 1 }, { sparse: true }),
      mongoDb.collection('profiles').createIndex({ userId: 1 }, { unique: true }),
      mongoDb.collection('refreshTokens').createIndex({ tokenHash: 1 }, { unique: true }),
      mongoDb.collection('refreshTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      mongoDb.collection('passwordResetTokens').createIndex({ tokenHash: 1 }, { unique: true }),
      mongoDb.collection('passwordResetTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      mongoDb.collection('verificationTokens').createIndex({ tokenHash: 1 }, { unique: true }),
      mongoDb.collection('verificationTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      mongoDb.collection('notifications').createIndex({ userId: 1, createdAt: -1 }),
      mongoDb.collection('conversations').createIndex({ id: 1 }, { unique: true }),
      mongoDb.collection('conversations').createIndex({ participants: 1 }),
      mongoDb.collection('connectionRequests').createIndex({ id: 1 }, { unique: true }),
      mongoDb.collection('connectionRequests').createIndex({ pairKey: 1 }),
      mongoDb.collection('connectionRequests').createIndex({ fromUserId: 1, status: 1, updatedAt: -1 }),
      mongoDb.collection('connectionRequests').createIndex({ toUserId: 1, status: 1, updatedAt: -1 }),
      mongoDb.collection('projectRequests').createIndex({ id: 1 }, { unique: true }),
      mongoDb.collection('projectRequests').createIndex({ ideaId: 1, status: 1, updatedAt: -1 }),
      mongoDb.collection('projectRequests').createIndex({ fromUserId: 1, status: 1, updatedAt: -1 }),
      mongoDb.collection('projectRequests').createIndex({ toUserId: 1, status: 1, updatedAt: -1 }),
      mongoDb.collection('auditLogs').createIndex({ createdAt: -1 }),
      mongoDb.collection('ideas').createIndex({ id: 1 }, { unique: true }),
      mongoDb.collection('ideas').createIndex({ authorId: 1 }),
      mongoDb.collection('ideas').createIndex({ createdAt: -1 }),
    ]);
  }

  return mongoDb;
};

export const getStorageProvider = () => dbProvider;
export { dbProvider, mongo, readJson, writeJson };

export const initializeStorage = async () => {
  if (dbProvider === 'mongo') {
    await mongo();
    return;
  }
  ensureJsonDb();
};

export const findUserById = async (id) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('users').findOne({ id }, { projection: { _id: 0 } });
  }
  const db = readJson();
  return db.users.find((u) => u.id === id) || null;
};

export const findUserByEmail = async (email) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('users').findOne({ email }, { projection: { _id: 0 } });
  }
  const db = readJson();
  return db.users.find((u) => u.email === email) || null;
};

export const findUserByGoogleIdOrEmail = async ({ email, googleId }) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('users').findOne(
      {
        $or: [{ email }, { googleId }],
      },
      { projection: { _id: 0 } }
    );
  }
  const db = readJson();
  return db.users.find((u) => u.email === email || (u.googleId && u.googleId === googleId)) || null;
};

export const insertUser = async (user) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('users').insertOne(user);
    return user;
  }
  const db = readJson();
  db.users.push(user);
  writeJson(db);
  return user;
};

export const updateUser = async (id, updates) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('users').updateOne({ id }, { $set: updates });
    return findUserById(id);
  }

  const db = readJson();
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) return null;
  db.users[index] = { ...db.users[index], ...updates };
  writeJson(db);
  return db.users[index];
};

export const findProfileByUserId = async (userId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const profile = await db.collection('profiles').findOne({ userId }, { projection: { _id: 0 } });
    return profile ? profile.profile : null;
  }

  const db = readJson();
  return db.profiles[userId] || null;
};

export const upsertProfile = async (userId, profile) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('profiles').updateOne(
      { userId },
      { $set: { userId, profile } },
      { upsert: true }
    );
    return profile;
  }

  const db = readJson();
  db.profiles[userId] = profile;
  writeJson(db);
  return profile;
};

export const storeRefreshToken = async ({ userId, tokenHash, expiresAt }) => {
  const payload = { userId, tokenHash, expiresAt };
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('refreshTokens').insertOne(payload);
    return;
  }

  const db = readJson();
  db.refreshTokens = db.refreshTokens.filter((t) => new Date(t.expiresAt).getTime() > Date.now());
  db.refreshTokens.push(payload);
  writeJson(db);
};

export const consumeRefreshToken = async (tokenHash) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const found = await db.collection('refreshTokens').findOne({ tokenHash }, { projection: { _id: 0 } });
    if (!found) return null;
    await db.collection('refreshTokens').deleteOne({ tokenHash });
    if (new Date(found.expiresAt).getTime() <= Date.now()) return null;
    return found;
  }

  const db = readJson();
  db.refreshTokens = db.refreshTokens.filter((t) => new Date(t.expiresAt).getTime() > Date.now());
  const found = db.refreshTokens.find((t) => t.tokenHash === tokenHash);
  db.refreshTokens = db.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  writeJson(db);
  return found || null;
};

export const revokeRefreshToken = async (tokenHash) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('refreshTokens').deleteOne({ tokenHash });
    return;
  }

  const db = readJson();
  db.refreshTokens = db.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  writeJson(db);
};

export const createPasswordResetToken = async ({ userId, tokenHash, expiresAt }) => {
  const payload = { userId, tokenHash, expiresAt };
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('passwordResetTokens').insertOne(payload);
    return;
  }

  const db = readJson();
  db.passwordResetTokens = db.passwordResetTokens.filter((t) => new Date(t.expiresAt).getTime() > Date.now());
  db.passwordResetTokens.push(payload);
  writeJson(db);
};

export const consumePasswordResetToken = async (tokenHash) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const found = await db.collection('passwordResetTokens').findOne({ tokenHash }, { projection: { _id: 0 } });
    if (!found) return null;
    await db.collection('passwordResetTokens').deleteOne({ tokenHash });
    if (new Date(found.expiresAt).getTime() <= Date.now()) return null;
    return found;
  }

  const db = readJson();
  db.passwordResetTokens = db.passwordResetTokens.filter((t) => new Date(t.expiresAt).getTime() > Date.now());
  const found = db.passwordResetTokens.find((t) => t.tokenHash === tokenHash);
  db.passwordResetTokens = db.passwordResetTokens.filter((t) => t.tokenHash !== tokenHash);
  writeJson(db);
  return found || null;
};

export const closeStorage = async () => {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    mongoDb = null;
  }
};

export const searchUsers = async ({ q = '', excludeUserId = '', limit = 20 } = {}) => {
  const safeSearch = String(q || '').trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));

  if (dbProvider === 'mongo') {
    const db = await mongo();
    const filter = {
      ...(excludeUserId ? { id: { $ne: excludeUserId } } : {}),
      ...(safeSearch
        ? {
            $or: [
              { name: { $regex: escapeRegExp(safeSearch), $options: 'i' } },
              { email: { $regex: escapeRegExp(safeSearch), $options: 'i' } },
            ],
          }
        : {}),
    };
    return db.collection('users').find(filter, { projection: { _id: 0 } }).limit(safeLimit).toArray();
  }

  const db = readJson();
  return db.users
    .filter((u) => u.id !== excludeUserId)
    .filter((u) => {
      if (!safeSearch) return true;
      return String(u.name || '').toLowerCase().includes(safeSearch)
        || String(u.email || '').toLowerCase().includes(safeSearch);
    })
    .slice(0, safeLimit);
};

const normalizeConversation = (conversation) => ({
  ...conversation,
  participants: Array.isArray(conversation.participants) ? conversation.participants : [],
  messages: Array.isArray(conversation.messages) ? conversation.messages : [],
  unreadBy: conversation.unreadBy || {},
  favoriteBy: conversation.favoriteBy || {},
});

const normalizeProjectRequest = (request) => ({
  ...request,
  status: request.status || 'pending',
  createdAt: request.createdAt || new Date().toISOString(),
  updatedAt: request.updatedAt || request.createdAt || new Date().toISOString(),
});

export const listConversationsForUser = async (userId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const docs = await db.collection('conversations').find(
      { participants: userId },
      { projection: { _id: 0 } }
    ).toArray();
    return docs
      .map(normalizeConversation)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  const db = readJson();
  return (db.conversations || [])
    .filter((conversation) => (conversation.participants || []).includes(userId))
    .map(normalizeConversation)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
};

export const findConversationById = async (conversationId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const doc = await db.collection('conversations').findOne({ id: conversationId }, { projection: { _id: 0 } });
    return doc ? normalizeConversation(doc) : null;
  }

  const db = readJson();
  const found = db.conversations.find((c) => c.id === conversationId);
  return found ? normalizeConversation(found) : null;
};

export const findConversationBetweenUsers = async (a, b) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const doc = await db.collection('conversations').findOne(
      { participants: { $all: [a, b] } },
      { projection: { _id: 0 } }
    );
    return doc ? normalizeConversation(doc) : null;
  }

  const db = readJson();
  const found = db.conversations.find((c) => c.participants.includes(a) && c.participants.includes(b));
  return found ? normalizeConversation(found) : null;
};

export const upsertConversation = async (conversation) => {
  const payload = normalizeConversation(conversation);
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('conversations').updateOne({ id: payload.id }, { $set: payload }, { upsert: true });
    return payload;
  }

  const db = readJson();
  const idx = db.conversations.findIndex((c) => c.id === payload.id);
  if (idx === -1) db.conversations.push(payload);
  else db.conversations[idx] = payload;
  writeJson(db);
  return payload;
};

export const deleteConversationById = async (conversationId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('conversations').deleteOne({ id: conversationId });
    return;
  }

  const db = readJson();
  db.conversations = (db.conversations || []).filter((c) => c.id !== conversationId);
  writeJson(db);
};

export const deleteConversationsByUser = async (userId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('conversations').deleteMany({ participants: userId });
    return;
  }

  const db = readJson();
  db.conversations = db.conversations.filter((c) => !(c.participants || []).includes(userId));
  writeJson(db);
};

export const findProjectRequestById = async (id) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const doc = await db.collection('projectRequests').findOne({ id }, { projection: { _id: 0 } });
    return doc ? normalizeProjectRequest(doc) : null;
  }

  const db = readJson();
  const found = (db.projectRequests || []).find((r) => r.id === id);
  return found ? normalizeProjectRequest(found) : null;
};

export const findLatestProjectRequest = async ({ ideaId, fromUserId } = {}) => {
  if (!ideaId && !fromUserId) return null;

  if (dbProvider === 'mongo') {
    const db = await mongo();
    const filter = {
      ...(ideaId ? { ideaId } : {}),
      ...(fromUserId ? { fromUserId } : {}),
    };
    const doc = await db.collection('projectRequests')
      .find(filter, { projection: { _id: 0 } })
      .sort({ updatedAt: -1 })
      .limit(1)
      .next();
    return doc ? normalizeProjectRequest(doc) : null;
  }

  const db = readJson();
  const sorted = (db.projectRequests || [])
    .filter((r) => (ideaId ? r.ideaId === ideaId : true))
    .filter((r) => (fromUserId ? r.fromUserId === fromUserId : true))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return sorted.length ? normalizeProjectRequest(sorted[0]) : null;
};

export const saveProjectRequest = async (request) => {
  const payload = normalizeProjectRequest(request);

  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('projectRequests').updateOne({ id: payload.id }, { $set: payload }, { upsert: true });
    return payload;
  }

  const db = readJson();
  db.projectRequests = db.projectRequests || [];
  const idx = db.projectRequests.findIndex((r) => r.id === payload.id);
  if (idx >= 0) db.projectRequests[idx] = payload;
  else db.projectRequests.push(payload);
  writeJson(db);
  return payload;
};

export const listProjectRequestsForUser = async (userId, { type = 'incoming', status } = {}) => {
  const safeType = ['incoming', 'outgoing', 'all'].includes(type) ? type : 'incoming';

  const matchesType = (request) => {
    if (safeType === 'incoming') return request.toUserId === userId;
    if (safeType === 'outgoing') return request.fromUserId === userId;
    return request.toUserId === userId || request.fromUserId === userId;
  };

  if (dbProvider === 'mongo') {
    const db = await mongo();
    const filter = {
      ...(safeType === 'incoming' ? { toUserId: userId } : {}),
      ...(safeType === 'outgoing' ? { fromUserId: userId } : {}),
      ...(safeType === 'all' ? { $or: [{ toUserId: userId }, { fromUserId: userId }] } : {}),
      ...(status ? { status } : {}),
    };
    const docs = await db.collection('projectRequests')
      .find(filter, { projection: { _id: 0 } })
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(normalizeProjectRequest);
  }

  const db = readJson();
  return (db.projectRequests || [])
    .map(normalizeProjectRequest)
    .filter(matchesType)
    .filter((request) => (status ? request.status === status : true))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
};

export const deleteProjectRequestsByUser = async (userId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('projectRequests').deleteMany({ $or: [{ fromUserId: userId }, { toUserId: userId }] });
    return;
  }

  const db = readJson();
  db.projectRequests = (db.projectRequests || []).filter((r) => r.fromUserId !== userId && r.toUserId !== userId);
  writeJson(db);
};

const normalizeConnectionRequest = (request) => ({
  ...request,
  status: request.status || 'pending',
  createdAt: request.createdAt || new Date().toISOString(),
  updatedAt: request.updatedAt || request.createdAt || new Date().toISOString(),
});

const makePairKey = (a, b) => [String(a || ''), String(b || '')].sort().join('::');

export const findConnectionRequestById = async (id) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const doc = await db.collection('connectionRequests').findOne({ id }, { projection: { _id: 0 } });
    return doc ? normalizeConnectionRequest(doc) : null;
  }

  const db = readJson();
  const found = (db.connectionRequests || []).find((r) => r.id === id);
  return found ? normalizeConnectionRequest(found) : null;
};

export const findLatestConnectionBetweenUsers = async (a, b) => {
  const pairKey = makePairKey(a, b);

  if (dbProvider === 'mongo') {
    const db = await mongo();
    const doc = await db.collection('connectionRequests')
      .find({ pairKey }, { projection: { _id: 0 } })
      .sort({ updatedAt: -1 })
      .limit(1)
      .next();
    return doc ? normalizeConnectionRequest(doc) : null;
  }

  const db = readJson();
  const sorted = (db.connectionRequests || [])
    .filter((r) => r.pairKey === pairKey)
    .sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')));
  return sorted.length ? normalizeConnectionRequest(sorted[0]) : null;
};

export const saveConnectionRequest = async (request) => {
  const payload = normalizeConnectionRequest(request);

  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('connectionRequests').updateOne({ id: payload.id }, { $set: payload }, { upsert: true });
    return payload;
  }

  const db = readJson();
  db.connectionRequests = db.connectionRequests || [];
  const idx = db.connectionRequests.findIndex((r) => r.id === payload.id);
  if (idx >= 0) db.connectionRequests[idx] = payload;
  else db.connectionRequests.push(payload);
  writeJson(db);
  return payload;
};

export const listConnectionRequestsForUser = async (userId, { type = 'incoming', status } = {}) => {
  const safeType = ['incoming', 'outgoing', 'all'].includes(type) ? type : 'incoming';

  const filterByType = (request) => {
    if (safeType === 'incoming') return request.toUserId === userId;
    if (safeType === 'outgoing') return request.fromUserId === userId;
    return request.toUserId === userId || request.fromUserId === userId;
  };

  if (dbProvider === 'mongo') {
    const db = await mongo();
    const mongoFilter = {
      ...(safeType === 'incoming' ? { toUserId: userId } : {}),
      ...(safeType === 'outgoing' ? { fromUserId: userId } : {}),
      ...(safeType === 'all' ? { $or: [{ toUserId: userId }, { fromUserId: userId }] } : {}),
      ...(status ? { status } : {}),
    };

    const docs = await db.collection('connectionRequests')
      .find(mongoFilter, { projection: { _id: 0 } })
      .sort({ updatedAt: -1 })
      .toArray();

    return docs.map(normalizeConnectionRequest);
  }

  const db = readJson();
  return (db.connectionRequests || [])
    .map(normalizeConnectionRequest)
    .filter(filterByType)
    .filter((request) => (status ? request.status === status : true))
    .sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')));
};

export const listAcceptedConnectionsForUser = async (userId) => {
  const all = await listConnectionRequestsForUser(userId, { type: 'all', status: 'accepted' });
  return all;
};

export const listUsers = async () => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('users').find({}, { projection: { _id: 0 } }).toArray();
  }

  const db = readJson();
  return db.users;
};

export const queryUsers = async ({ page = 1, limit = 10, search = '', sortBy = 'createdAt', sortOrder = 'desc' } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
  const safeOrder = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
  const safeSortBy = ['name', 'email', 'createdAt', 'updatedAt', 'role', 'provider'].includes(sortBy) ? sortBy : 'createdAt';
  const safeSearch = String(search || '').trim().toLowerCase();

  if (dbProvider === 'mongo') {
    const db = await mongo();
    const filter = safeSearch
      ? {
          $or: [
            { name: { $regex: escapeRegExp(safeSearch), $options: 'i' } },
            { email: { $regex: escapeRegExp(safeSearch), $options: 'i' } },
          ],
        }
      : {};

    const total = await db.collection('users').countDocuments(filter);
    const users = await db.collection('users')
      .find(filter, { projection: { _id: 0 } })
      .sort({ [safeSortBy]: safeOrder })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .toArray();

    return { users, total, page: safePage, limit: safeLimit };
  }

  const db = readJson();
  const filtered = db.users.filter((u) => {
    if (!safeSearch) return true;
    return String(u.name || '').toLowerCase().includes(safeSearch)
      || String(u.email || '').toLowerCase().includes(safeSearch);
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = String(a?.[safeSortBy] ?? '').toLowerCase();
    const bv = String(b?.[safeSortBy] ?? '').toLowerCase();
    if (av === bv) return 0;
    return av > bv ? safeOrder : -safeOrder;
  });

  const total = sorted.length;
  const start = (safePage - 1) * safeLimit;
  const users = sorted.slice(start, start + safeLimit);
  return { users, total, page: safePage, limit: safeLimit };
};

export const listProfiles = async () => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    const docs = await db.collection('profiles').find({}, { projection: { _id: 0 } }).toArray();
    return Object.fromEntries(docs.map((d) => [d.userId, d.profile]));
  }

  const db = readJson();
  return db.profiles;
};

export const listRefreshTokens = async () => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('refreshTokens').find({}, { projection: { _id: 0 } }).toArray();
  }

  const db = readJson();
  return db.refreshTokens;
};

export const listPasswordResetTokens = async () => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('passwordResetTokens').find({}, { projection: { _id: 0 } }).toArray();
  }

  const db = readJson();
  return db.passwordResetTokens;
};

export const deleteUserById = async (userId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await Promise.all([
      db.collection('users').deleteOne({ id: userId }),
      db.collection('profiles').deleteOne({ userId }),
      db.collection('refreshTokens').deleteMany({ userId }),
      db.collection('passwordResetTokens').deleteMany({ userId }),
      db.collection('conversations').deleteMany({ participants: userId }),
      db.collection('connectionRequests').deleteMany({ $or: [{ fromUserId: userId }, { toUserId: userId }] }),
      db.collection('projectRequests').deleteMany({ $or: [{ fromUserId: userId }, { toUserId: userId }] }),
    ]);
    return;
  }

  const db = readJson();
  db.users = db.users.filter((u) => u.id !== userId);
  delete db.profiles[userId];
  db.refreshTokens = db.refreshTokens.filter((t) => t.userId !== userId);
  db.passwordResetTokens = db.passwordResetTokens.filter((t) => t.userId !== userId);
  db.conversations = db.conversations.filter((c) => !(c.participants || []).includes(userId));
  db.connectionRequests = (db.connectionRequests || []).filter((r) => r.fromUserId !== userId && r.toUserId !== userId);
  db.projectRequests = (db.projectRequests || []).filter((r) => r.fromUserId !== userId && r.toUserId !== userId);
  writeJson(db);
};

export const revokeAllRefreshTokensForUser = async (userId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('refreshTokens').deleteMany({ userId });
    return;
  }

  const db = readJson();
  db.refreshTokens = db.refreshTokens.filter((t) => t.userId !== userId);
  writeJson(db);
};

export const addAuditLog = async (entry) => {
  const payload = {
    id: entry.id,
    actorId: entry.actorId || '',
    actorRole: entry.actorRole || 'user',
    action: entry.action || 'unknown',
    targetUserId: entry.targetUserId || null,
    details: entry.details || {},
    createdAt: entry.createdAt,
  };

  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('auditLogs').insertOne(payload);
    return payload;
  }

  const db = readJson();
  db.auditLogs.push(payload);
  db.auditLogs = db.auditLogs.slice(-3000);
  writeJson(db);
  return payload;
};

export const listAuditLogs = async ({ page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));

  if (dbProvider === 'mongo') {
    const db = await mongo();
    const total = await db.collection('auditLogs').countDocuments({});
    const logs = await db.collection('auditLogs')
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .toArray();
    return { logs, total, page: safePage, limit: safeLimit };
  }

  const db = readJson();
  const sorted = [...db.auditLogs].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const total = sorted.length;
  const start = (safePage - 1) * safeLimit;
  return {
    logs: sorted.slice(start, start + safeLimit),
    total,
    page: safePage,
    limit: safeLimit,
  };
};

// ── NOTIFICATIONS ─────────────────────────────────────────────────

export const createNotification = async ({ id, userId, type, text, actorUserId, createdAt, read = false }) => {
  const payload = {
    id,
    userId,
    type,
    text,
    actorUserId: actorUserId || null,
    createdAt,
    read: Boolean(read),
  };

  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('notifications').insertOne(payload);
    return payload;
  }

  const db = readJson();
  db.notifications = db.notifications || [];
  db.notifications.push(payload);
  db.notifications = db.notifications.slice(-500); // cap local storage growth
  writeJson(db);
  return payload;
};

export const listNotificationsForUser = async (userId, { limit = 50 } = {}) => {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));

  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('notifications')
      .find({ userId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .toArray();
  }

  const db = readJson();
  return (db.notifications || [])
    .filter((n) => n.userId === userId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, safeLimit);
};

export const markNotificationsReadForUser = async (userId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('notifications').updateMany({ userId, read: false }, { $set: { read: true } });
    return;
  }

  const db = readJson();
  db.notifications = (db.notifications || []).map((n) => (n.userId === userId ? { ...n, read: true } : n));
  writeJson(db);
};

export const deleteNotificationsForUser = async (userId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('notifications').deleteMany({ userId });
    return;
  }

  const db = readJson();
  db.notifications = (db.notifications || []).filter((n) => n.userId !== userId);
  writeJson(db);
};

export const saveIdea = async (idea) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('ideas').updateOne({ id: idea.id }, { $set: idea }, { upsert: true });
    return idea;
  }

  const db = readJson();
  db.ideas = db.ideas || [];
  const index = db.ideas.findIndex((item) => item.id === idea.id);
  if (index >= 0) {
    db.ideas[index] = idea;
  } else {
    db.ideas.push(idea);
  }
  writeJson(db);
  return idea;
};

export const listAllIdeas = async () => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('ideas').find({}, { projection: { _id: 0 } }).toArray();
  }

  const db = readJson();
  return db.ideas || [];
};

export const findIdeasByUserId = async (userId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('ideas').find({ authorId: userId }, { projection: { _id: 0 } }).toArray();
  }

  const db = readJson();
  return (db.ideas || []).filter((item) => item.authorId === userId);
};

export const findIdeaById = async (ideaId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    return db.collection('ideas').findOne({ id: ideaId }, { projection: { _id: 0 } });
  }

  const db = readJson();
  return (db.ideas || []).find((item) => item.id === ideaId) || null;
};

export const deleteIdeaById = async (ideaId) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('ideas').deleteOne({ id: ideaId });
    return;
  }

  const db = readJson();
  db.ideas = (db.ideas || []).filter((item) => item.id !== ideaId);
  writeJson(db);
};

export const updateIdeaById = async (ideaId, updates) => {
  if (dbProvider === 'mongo') {
    const db = await mongo();
    await db.collection('ideas').updateOne({ id: ideaId }, { $set: updates });
    return findIdeaById(ideaId);
  }

  const db = readJson();
  db.ideas = db.ideas || [];
  const index = db.ideas.findIndex((item) => item.id === ideaId);
  if (index === -1) return null;
  db.ideas[index] = { ...db.ideas[index], ...updates };
  writeJson(db);
  return db.ideas[index];
};
