import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import ideaRoutes from './routes/ideaRoutes.js';
import userRoutes from './routes/userRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import connectionRoutes from './routes/connectionRoutes.js';
import { closeStorage, getStorageProvider, initializeStorage, findUserById, findConversationById } from './services/storage.js';
import { setSocketIo } from './services/socketHub.js';
import { emitToUsers } from './services/socketHub.js';

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT || 4000);
// Normalize once: browsers serialize origins without trailing slashes, and
// "https://site.com/" in FRONTEND_URL would break CORS string-matching.
// FRONTEND_URL accepts a comma-separated list so multiple frontends
// (e.g. old Netlify + new Vercel during migration) can share one backend.
const stripTrailingSlash = (url) => String(url || '').trim().replace(/\/+$/, '');
const FRONTEND_URLS = String(process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(stripTrailingSlash)
  .filter(Boolean);
const FRONTEND_URL = FRONTEND_URLS[0];
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET || 'replace-me-in-env';
let serverInstance = null;
let isShuttingDown = false;

const io = new SocketServer(httpServer, {
  cors: {
    origin: FRONTEND_URLS,
  },
});
setSocketIo(io);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing token'));

    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (payload?.type !== 'access') return next(new Error('Invalid token type'));

    const user = await findUserById(payload.sub);
    if (!user) return next(new Error('Invalid user'));

    socket.data.userId = user.id;
    return next();
  } catch {
    return next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.data.userId}`);

  socket.on('typing', async ({ conversationId, isTyping }) => {
    if (!conversationId) return;
    const conversation = await findConversationById(conversationId);
    if (!conversation || !(conversation.participants || []).includes(socket.data.userId)) return;

    emitToUsers(
      (conversation.participants || []).filter((id) => id !== socket.data.userId),
      'conversation:typing',
      {
        conversationId,
        userId: socket.data.userId,
        isTyping: Boolean(isTyping),
      }
    );
  });

  socket.on('disconnect', () => {
    // No-op: typing state naturally clears on reconnect/refresh.
  });
});

app.use(helmet());
app.use(cors({ origin: FRONTEND_URLS }));
app.use(express.json({ limit: '3mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'collab-portal-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ideas', ideaRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/user', userRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const start = async () => {
  // Refuse to boot in production with missing/default secrets:
  // otherwise anyone can forge valid JWTs (including admin tokens).
  if (process.env.NODE_ENV === 'production') {
    const insecure = [];
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'replace-me-in-env') insecure.push('JWT_SECRET');
    if (!process.env.REFRESH_TOKEN_SECRET || process.env.REFRESH_TOKEN_SECRET === 'replace-me-in-env') insecure.push('REFRESH_TOKEN_SECRET');
    if (insecure.length > 0) {
      console.error(`Refusing to start: set strong production values for: ${insecure.join(', ')}`);
      process.exit(1);
    }
  }

  await initializeStorage();

  serverInstance = httpServer.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT} (${getStorageProvider()} storage)`);
  });

  httpServer.on('error', (err) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop other backend instances and restart.`);
      process.exit(1);
    }
    console.error('Server error', err);
    process.exit(1);
  });

  const shutdown = async (signal = 'SIGTERM') => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    io.close();
    await closeStorage();
    if (serverInstance) {
      serverInstance.close(() => {
        if (signal === 'SIGUSR2') {
          process.kill(process.pid, 'SIGUSR2');
          return;
        }
        process.exit(0);
      });
      return;
    }
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGUSR2', () => shutdown('SIGUSR2'));
};

start().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
