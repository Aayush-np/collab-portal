# CollabHub — CMRIT Collaboration Portal

A full-stack collaboration platform for CMRIT students to discover, post, and collaborate on projects and internships — with real-time messaging, team chats, live notifications, and a verified-student-only community.

![Node](https://img.shields.io/badge/node-%E2%89%A518.17-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-realtime-010101?logo=socket.io)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Deployment](#-deployment)
- [API Reference](#-api-reference)
- [Real-time Events](#-real-time-events)
- [Roles & Permissions](#-roles--permissions)
- [Security](#-security)
- [Maintenance](#-maintenance)
- [Contributing](#-contributing)
- [License](#-license)

## 🚀 Features

### Discovery & Collaboration
- **Project & Internship Discovery** — Post opportunities with skills, tags, team size, deadlines, and GitHub links
- **Smart Matching** — Find teammates based on skills, interests, and compatibility scores
- **Connection System** — Send/accept connection requests; accepting one instantly opens a chat
- **Live Feed** — New, edited, and deleted posts appear for everyone instantly — no refresh needed
- **Project Applications** — Apply to join a team; owners review requests from the Requests page

### Real-time Messaging
- **1:1 Chats** — Typing indicators, read receipts (✓/✓✓), favorites, unread badges
- **Team Group Chats** — Accepting a member auto-creates a group chat with the whole team, named after the project; renameable by the project owner
- **Profile Peek** — Click any avatar or name in chat to view that user's profile
- **Message actions** — Delete your own messages; DMs can be cleared by either side

### Notifications
- **Real-time Alerts** — Toast + bell-menu notifications for new messages, connection requests/accepts, and project requests (persisted server-side, mark-as-read, clear-all)
- **Live Badges** — Unread counts on Messages and Requests everywhere in the app

### Accounts & Security
- **Email Verification** — Accounts are only created after the verification link is clicked; unverified signups never appear anywhere
- **Password Reset** — Time-limited, single-use tokens; the token is hidden from the UI, address bar, and server logs
- **Resend Verification** — Users can request a fresh link anytime
- **Privacy Policy & Terms** — Public legal pages at `/privacy` and `/terms`

### Administration
- **Admin Dashboard** — User management, audit logs, content moderation
- **Role-based Access** — Granular permissions per role (see [Roles & Permissions](#-roles--permissions))
- **Verified Community** — Only `@cmrit.ac.in` addresses can sign up

### Design
- **Responsive-first** — Comfortable on phones, tablets, and desktops
- **Accessible motion** — Entrance staggers, micro-interactions, and `prefers-reduced-motion` support

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Motion for React |
| Backend | Node.js, Express 5, Socket.IO |
| Database | MongoDB Atlas (production) / JSON file (local dev) |
| Auth | JWT (access + rotating refresh tokens), bcrypt, deferred email verification |
| Email | Brevo API (SMTP fallback) |
| Real-time | Socket.IO with JWT-authenticated sockets |
| Hosting | Vercel (frontend) + Render (backend) |

## 📦 Project Structure

```
collab-portal/
├── backend/
│   ├── src/
│   │   ├── middleware/       # Auth, rate limiting
│   │   ├── routes/           # auth, ideas, messages, connections, notifications, admin, user
│   │   ├── services/         # auth, storage, mail, notifications, socket hub, profile template
│   │   ├── scripts/          # resetAndSeed, migrateToMongo (maintenance)
│   │   ├── utils/            # Path helpers
│   │   └── server.js         # Entry point
│   └── data/                 # Local JSON storage (gitignored)
├── src/
│   ├── components/           # Navbar, Sidebar, ProjectCard, Toaster
│   ├── pages/                # Dashboard, Explore, PostIdea, Messages, Profile, Requests,
│   │                         # Auth, VerifyEmail, LegalPage, Admin
│   ├── hooks/                # useModalBehavior
│   ├── services/             # API client (fetch wrapper with refresh-token retry)
│   ├── utils/                # chatActions, time, toast
│   ├── img/                  # Logo + favicon
│   └── App.jsx               # App shell, routing, sockets, notification state
├── public/                   # robots.txt
├── vercel.json               # Vercel rewrites + security headers (CSP)
└── package.json
```

## 🚀 Quick Start

**Prerequisites:** Node.js ≥ 18.17 and npm.

```bash
# 1. Install dependencies
npm install

# 2. Create your local .env (see Configuration below)

# 3. Start both dev servers
npm run dev
# Frontend → http://localhost:5173
# Backend  → http://localhost:4000
```

**Seed a local admin** (optional — wipes local data and creates one verified superadmin):

```bash
node backend/src/scripts/resetAndSeed.js admin@cmrit.ac.in YourPassword123 "Admin Name"
```

### Configuration (local `.env`)

```env
# Backend
PORT=4000
NODE_ENV=development
DB_PROVIDER=json
JWT_SECRET=your-local-secret
REFRESH_TOKEN_SECRET=your-local-refresh-secret
ALLOWED_EMAIL_DOMAIN=cmrit.ac.in
SUPERADMIN_EMAILS=your-email@cmrit.ac.in

# Frontend (Vite)
VITE_API_BASE_URL=/api
VITE_SOCKET_URL=http://localhost:4000
```

> Local development uses JSON-file storage (`backend/data/db.json`) — no MongoDB required. Emails fall back to console logs when Brevo isn't configured, and verification links are printed in the server output.

## 🌐 Deployment

| Platform | Purpose | Cost |
|----------|---------|------|
| **Vercel** | Frontend hosting | Free (Hobby) |
| **Render** | Backend API + Socket.IO | Free (750 hrs/mo) |
| **MongoDB Atlas** | Database | Free (512 MB) |
| **Brevo** | Transactional email | Free (300/day) |

### Steps

1. **Push to GitHub** (this repo)
2. **MongoDB Atlas** → Create a cluster → copy the connection string
3. **Brevo** → Create account → generate an API key (`xkeysib-...`) → verify a sender
4. **Render** → New Web Service → connect the GitHub repo → add env vars (below) → deploy
5. **Vercel** → Import from GitHub → framework: Vite (auto-detected) → add env vars → deploy
6. **Render** → point `FRONTEND_URL` and `APP_BASE_URL` at your Vercel URL

### Render Environment Variables

```env
# Backend
PORT=4000
NODE_ENV=production
DB_PROVIDER=mongo
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=collab_portal
JWT_SECRET=your-strong-random-secret
REFRESH_TOKEN_SECRET=your-other-strong-random-secret
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
RESET_TOKEN_EXPIRES_MINUTES=20

# Comma-separated list of allowed frontend origins (no trailing slashes).
# Multiple frontends can share one backend — e.g. during a domain migration.
FRONTEND_URL=https://your-app.vercel.app
APP_BASE_URL=https://your-app.vercel.app

# Email (Brevo API — recommended; works from any host IP)
BREVO_API_KEY=xkeysib-your-brevo-api-key
# SMTP fallback (optional when BREVO_API_KEY is set)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=your-brevo-login-email
SMTP_PASS=your-brevo-smtp-key
MAIL_FROM=CollabHub <your-verified-sender@domain.com>

# Domain & roles
ALLOWED_EMAIL_DOMAIN=cmrit.ac.in
SUPERADMIN_EMAILS=your-admin@cmrit.ac.in
EDITOR_ADMIN_EMAILS=
SUPPORT_ADMIN_EMAILS=
ADMIN_EMAILS=

# Optional
ENABLE_GOOGLE_AUTH=0
GOOGLE_CLIENT_ID=
TURNSTILE_SECRET_KEY=
```

> ⚠️ The backend refuses to boot in production with default JWT secrets — set strong values for `JWT_SECRET` and `REFRESH_TOKEN_SECRET`.

### Vercel Environment Variables

```env
VITE_API_BASE_URL=https://your-render-service.onrender.com/api
VITE_SOCKET_URL=https://your-render-service.onrender.com
VITE_TURNSTILE_SITE_KEY=
VITE_ENABLE_GOOGLE_AUTH=0
VITE_GOOGLE_CLIENT_ID=
```

> Socket.IO connects **directly** to Render (`VITE_SOCKET_URL`) — websockets are not proxied through Vercel. The `/api/*` and `/socket.io/*` rewrites in `vercel.json` are a fallback for same-origin setups.

## 📝 API Reference

Base URL: `/api` · Authenticated routes expect `Authorization: Bearer <accessToken>`

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service status — point uptime monitors here |

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Sign up — creates a *pending* record only; no user until verified |
| POST | `/auth/login` | Login (verified accounts only) |
| POST | `/auth/verify-email` | Consume verification token — **this creates the user** |
| POST | `/auth/resend-verification` | Send a fresh verification link |
| POST | `/auth/forgot-password` | Email a reset link |
| POST | `/auth/reset-password` | Set a new password with token |
| POST | `/auth/refresh` | Rotate the refresh token |
| POST | `/auth/logout` | Revoke the refresh token |

### Ideas / Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ideas` | List all ideas |
| POST | `/ideas` | Create idea (auth) |
| PUT | `/ideas/:id` | Update own idea |
| DELETE | `/ideas/:id` | Delete own idea (or admin) — also purges its requests and team chat |
| POST | `/ideas/:id/request` | Apply to join |
| GET | `/ideas/requests?type=` | List incoming/outgoing project requests |
| POST | `/ideas/requests/:id/accept` | Accept applicant — auto-creates/merges the team group chat |
| POST | `/ideas/requests/:id/reject` | Reject applicant |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/messages/conversations` | List DMs + team groups |
| POST | `/messages/conversations` | Start/get a 1:1 conversation |
| POST | `/messages/send` | Send message (unreads update for all recipients) |
| GET | `/messages/users?q=` | Search people |
| POST | `/messages/:id/read` | Mark conversation read |
| POST | `/messages/:id/favorite` | Toggle favorite |
| PUT | `/messages/:id/name` | Rename team group (project owner only) |
| DELETE | `/messages/:id/messages/:messageId` | Delete own message |
| DELETE | `/messages/:id` | Delete chat (DMs: either side · groups: owner only) |

### Connections
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/connections/summary` | Counts + connected/pending user IDs |
| POST | `/connections/request` | Send connection request |
| POST | `/connections/requests/:id/accept` | Accept — also creates a chat between both users |
| POST | `/connections/requests/:id/reject` | Reject |
| GET | `/connections/connected` | List accepted connections |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | List notifications + unread count |
| POST | `/notifications/read` | Mark all as read |
| DELETE | `/notifications` | Clear all |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/overview` | Platform stats |
| GET | `/admin/users` | Paginated user list |
| PUT | `/admin/users/:id` | Update user |
| POST | `/admin/users/:id/password` | Reset user password |
| DELETE | `/admin/users/:id` | Delete user (superadmin) |
| GET | `/admin/audit-logs` | Audit log |

## ⚡ Real-time Events

Socket.IO connections authenticate with the access token (`auth: { token }`) and join a per-user room.

| Event (server → client) | Fires when |
|------------------------|------------|
| `message:new` | A message is sent to a conversation you're in |
| `conversation:typing` | Someone starts/stops typing |
| `conversation:read` | Someone reads the conversation |
| `conversation:updated` | Rename, favorite, or team membership change |
| `conversation:deleted` | A chat is deleted/cleared |
| `notification:new` | Anything you should know about: message, connection, project request |
| `ideas:changed` | Any idea is created/edited/deleted → feeds refresh live |
| `connection:request:new` / `connection:request:updated` | Connection request activity |
| `connections:changed` | Connection list changed |

| Event (client → server) | Purpose |
|------------------------|---------|
| `typing` | Broadcast typing state (`{ conversationId, isTyping }`) |

## 🔑 Roles & Permissions

Roles are assigned at registration via env vars (`SUPERADMIN_EMAILS`, `EDITOR_ADMIN_EMAILS`, `SUPPORT_ADMIN_EMAILS`, `ADMIN_EMAILS`).

| Role | Read admin | Edit users/content | Security actions | Delete users / manage roles |
|------|:---:|:---:|:---:|:---:|
| `superadmin` | ✅ | ✅ | ✅ | ✅ |
| `editor-admin` | ✅ | ✅ | ✖️ | ✖️ |
| `support-admin` / `admin` | ✅ | ✖️ | ✅ | ✖️ |
| `user` | ✖️ | ✖️ | ✖️ | ✖️ |

## 🔒 Security

- **Email domain restriction** — only `@cmrit.ac.in` addresses can register
- **Deferred registration** — no user data exists until the verification link is clicked; fake emails never pollute the database or search
- **JWT** — short-lived access tokens + rotating refresh tokens, revoked on reuse
- **Rate limiting** — credential endpoints throttled per IP
- **Secure password reset** — time-limited, single-use tokens delivered via URL fragments (never sent to servers/logs, hidden from the address bar)
- **CSP & security headers** — configured in `vercel.json`
- **Input validation** — server-side sanitization, length caps, regex escaping
- **CORS** — strict multi-origin allowlist
- **Audit logging** — every admin action recorded
- **Legal pages** — `/privacy` and `/terms`

## 🔧 Maintenance

### Reset database + seed a verified superadmin

Wipes **all** data (users, chats, ideas, notifications, tokens) and creates one verified superadmin. Works against MongoDB (production) or local JSON:

```powershell
# Production (copy MONGODB_URI from Render → Environment)
$env:DB_PROVIDER="mongo"
$env:MONGODB_URI="mongodb+srv://..."
node backend/src/scripts/resetAndSeed.js admin@cmrit.ac.in YourPassword123 "Admin Name"

# Local JSON storage
node backend/src/scripts/resetAndSeed.js admin@cmrit.ac.in YourPassword123 "Admin Name"
```

The script prints the target database and asks for confirmation before deleting anything (add `--yes` to skip).

### Migrate JSON → MongoDB

```bash
npm run migrate:mongo
```

## 🧪 Testing

```bash
# Type-check the bundle and catch build errors
npm run build

# Lint the backend syntax
node --check backend/src/server.js
```

## 🤝 Contributing

1. Fork the repo and create a feature branch (`git checkout -b feature/amazing`)
2. Keep changes typed-clean: `npm run build` must pass
3. Follow the existing patterns — CSS tokens live in `src/index.css`, API calls go through `src/services/api.js`
4. Open a Pull Request with a clear description of *what* and *why*

## 📄 License

MIT — free to use for learning or to extend for your own projects.

## 👨‍💻 Author

**Aayush Jaiswal** — CMRIT Student
GitHub: [@Aayush-np](https://github.com/Aayush-np)

---

*Built for CMRIT students to collaborate, innovate, and build together.*
