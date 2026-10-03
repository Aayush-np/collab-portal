# CollabHub — CMRIT Collaboration Portal

A full-stack collaboration platform for CMRIT students to discover, post, and collaborate on projects and internships. Built with React, Express, MongoDB, and Socket.IO.

## 🚀 Features

- **Project & Internship Discovery** — Post and discover collaboration opportunities with skill-based filtering
- **Smart Matching** — Find teammates based on skills, interests, and compatibility scores
- **Real-time Messaging** — Socket.IO powered chat with typing indicators, read receipts, and favorites
- **Connection System** — Send/accept connection requests, manage project applications
- **Email Verification** — Secure account creation with email verification flow
- **Password Reset** — Secure token-based password recovery via email
- **Role-based Access** — Superadmin, Editor, Support, and User roles with granular permissions
- **Admin Dashboard** — User management, audit logs, content moderation
- **Responsive Design** — Works seamlessly on desktop, tablet, and mobile

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Motion (Framer Motion) |
| Backend | Express.js, Socket.IO |
| Database | MongoDB Atlas (production) / JSON file (dev) |
| Auth | JWT (access + refresh tokens), bcrypt, email verification |
| Real-time | Socket.IO with JWT auth |
| Deployment | Netlify (frontend) + Render (backend) |

## 📦 Project Structure

```
collab-portal/
├── backend/
│   ├── src/
│   │   ├── middleware/       # Auth, rate limiting
│   │   ├── routes/           # API routes (auth, ideas, messages, connections, admin)
│   │   ├── services/         # Auth, storage, mail, socket hub
│   │   └── server.js         # Entry point
│   └── data/                 # Local JSON storage (gitignored)
├── src/
│   ├── components/           # Reusable UI components
│   ├── pages/                # Page components
│   ├── hooks/                # Custom React hooks
│   ├── services/             # API client
│   └── App.jsx               # Main app with routing
├── public/                   # Static assets, headers, robots.txt
├── netlify.toml              # Netlify config + redirects
└── package.json
```

## 🔒 Security Features

- **Email Domain Restriction** — Only `@cmrit.ac.in` emails can register
- **JWT Authentication** — Short-lived access tokens + rotating refresh tokens
- **Rate Limiting** — Login/register endpoints protected against brute force
- **Email Verification Required** — Accounts inactive until email verified
- **Secure Password Reset** — Time-limited, single-use tokens sent via email
- **CSP & Security Headers** — Configured via `public/_headers`
- **Input Validation** — Server-side sanitization, length limits, regex escaping
- **CORS Protection** — Strict origin validation
- **Audit Logging** — All admin actions logged

## 🚀 Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Start dev servers (frontend on :5173, backend on :4000)
npm run dev
```

### Environment Variables (`.env`)

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

## 🌐 Deployment (Free Tier)

| Platform | Purpose | Cost |
|----------|---------|------|
| **Netlify** | Frontend hosting | Free |
| **Render** | Backend API + Socket.IO | Free (750 hrs/mo) |
| **MongoDB Atlas** | Database | Free (512 MB) |

### Deploy Steps

1. **Push to GitHub** (this repo)
2. **MongoDB Atlas** → Create cluster → Get connection string
3. **Render** → New Web Service → Connect GitHub repo → Add env vars → Deploy
4. **Netlify** → Import from GitHub → Build: `npm run build`, Publish: `dist` → Add env vars
5. **Update Render** → Set `FRONTEND_URL` and `APP_BASE_URL` to your Netlify URL

See the full guide in `docs/DEPLOYMENT.md` (if present) or the original deployment docs.

## 📝 API Endpoints

### Auth
- `POST /api/auth/register` — Register with email verification
- `POST /api/auth/login` — Login (requires verified email)
- `POST /api/auth/verify-email` — Verify email token
- `POST /api/auth/forgot-password` — Request password reset
- `POST /api/auth/reset-password` — Reset password with token
- `POST /api/auth/refresh` — Refresh access token
- `POST /api/auth/logout` — Revoke refresh token

### Ideas/Projects
- `GET /api/ideas` — List all ideas
- `POST /api/ideas` — Create idea (auth required)
- `PUT /api/ideas/:id` — Update own idea
- `DELETE /api/ideas/:id` — Delete own idea (or admin)
- `POST /api/ideas/:id/request` — Apply to project

### Messages
- `GET /api/messages/conversations` — List conversations
- `POST /api/messages/conversations` — Start/create conversation
- `POST /api/messages/send` — Send message
- `GET /api/messages/users?q=` — Search users

### Connections
- `GET /api/connections/summary` — Connection counts
- `POST /api/connections/request` — Send connection request
- `POST /api/connections/requests/:id/accept` — Accept request
- `POST /api/connections/requests/:id/reject` — Reject request

### Admin (requires admin role)
- `GET /api/admin/overview` — Stats
- `GET /api/admin/users` — Paginated user list
- `PUT /api/admin/users/:id` — Update user
- `POST /api/admin/users/:id/password` — Reset user password
- `DELETE /api/admin/users/:id` — Delete user (superadmin)
- `GET /api/admin/audit-logs` — Audit log

## 🧪 Testing

```bash
# Run build to check for errors
npm run build

# Run lint/type checks (if configured)
# npm run lint
```

## 📄 License

MIT License — feel free to use for learning or extend for your own projects.

## 👨‍💻 Author

**Aayush Jaiswal** — CMRIT Student  
GitHub: [@Aayush-np](https://github.com/Aayush-np)

---

*Built for CMRIT students to collaborate, innovate, and build together.*