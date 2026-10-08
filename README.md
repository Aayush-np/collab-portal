# CollabHub — CMRIT Collaboration Portal

A full-stack collaboration platform where CMRIT students discover projects and internships, connect with verified teammates, and collaborate in real time — from posting an idea to building the team around it.

![Live](https://img.shields.io/website?down_message=offline&up_message=online&url=https%3A%2F%2Fcollab-portal-azure.vercel.app%2F)
![Node](https://img.shields.io/badge/node-%E2%89%A518.17-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-realtime-010101?logo=socket.io)
![License](https://img.shields.io/badge/license-MIT-blue)

### 🌐 Live at **[collab-portal-azure.vercel.app](https://collab-portal-azure.vercel.app/)**

---

## ✨ What It Does

Students sign up with their college email, verify it, and get a matched feed of project and internship opportunities. They connect, chat in real time, and when someone is accepted into a project, a **team group chat is created automatically** — so collaboration starts the second the team does.

| | |
|---|---|
| 🔎 **Discovery** | Post projects/internships with skills, tags, team size & deadlines; smart matching surfaces the right teammates |
| 💬 **Real-time Messaging** | 1:1 chats with typing indicators, read receipts (✓/✓✓) and favorites; **auto-created team group chats** on acceptance, renameable by the project owner |
| 🔔 **Live Notifications** | Toast + bell alerts for messages, connection requests and project applications — pushed over sockets, persisted server-side |
| 📡 **Live Feed** | Posts appear for everyone instantly — no refresh needed |
| 🤝 **Connections** | Request, accept, and message — accepting a connection opens a chat immediately |
| 👥 **Verified Community** | `@cmrit.ac.in` only; accounts are created only after email verification |
| 🛡️ **Admin Suite** | Role-based access (superadmin / editor / support), user management, and a full audit trail |
| 📱 **Responsive by default** | Mobile-first UI with staggered micro-animations and reduced-motion support |

## 🛠️ Tech Stack

| Layer | Choices |
|-------|---------|
| **Frontend** | React 18 · Vite · Motion for React · custom CSS design system |
| **Backend** | Node.js · Express 5 · Socket.IO |
| **Database** | MongoDB Atlas (prod) with a JSON-file adapter for local dev |
| **Auth** | JWT access + rotating refresh tokens · bcrypt · deferred email verification |
| **Email** | Brevo transactional API (SMTP fallback) |
| **Infra** | Vercel (frontend) · Render (API + sockets) |

## 🏗️ Architecture & Engineering Highlights

The parts I'm most proud of — happy to walk through any of these in an interview:

- **Zero-trust signups** — registration stores only a *pending* record; the user is created exclusively when the verification link is clicked. Fake or unreachable emails can never enter the database, search results, or the messaging directory.
- **Real-time backbone** — JWT-authenticated Socket.IO sockets joined into per-user rooms; every mutation (message, request, idea, notification) fans out live, so no client ever polls or refreshes.
- **Auto-managed team chats** — accepting a project request idempotently creates or merges a group conversation for the team, with owner-only rename rights enforced at the API layer.
- **Notification pipeline** — one service persists + pushes every user-facing event; the client keeps a single optimistic bell state and marks read in the background.
- **Token hygiene** — password-reset and verification links travel in URL *fragments* so secrets never hit server logs, and are scrubbed from the address bar on load.
- **Dual storage adapter** — the same storage interface serves a JSON file locally and MongoDB in production, so contributors can run the app with zero infrastructure.
- **Multi-tenant CORS** — a comma-separated origin allowlist with trailing-slash normalization lets multiple frontends (e.g. a domain migration) share one API safely.
- **Design system, not stylesheets** — one token layer (palette, elevation, motion curves) drives every component; the whole theme is re-skinnable from `src/index.css` without touching markup.
- **Failure-tolerant auth client** — every API call transparently refreshes an expired access token and retries once before surfacing an error.

## 🔒 Security Practices

- College-email domain restriction at registration and login
- Short-lived access tokens + **rotating refresh tokens**, revoked on reuse
- Per-IP rate limiting on credential endpoints
- Time-limited, single-use reset tokens (never exposed in URLs or logs)
- Server-side input validation, length caps and regex escaping
- CSP + security headers; strict multi-origin CORS
- Complete audit logging of admin actions

## 📡 API & Real-time Surface

REST API under `/api` with a consistent `{ error }` contract, plus a socket layer:

- **Auth** — register (deferred) · verify · resend · login · forgot/reset · refresh · logout
- **Ideas** — CRUD + apply/accept/reject (acceptance triggers the team-chat pipeline and live feed refresh)
- **Messages** — DMs & group chats, read receipts, favorites, owner-gated renames
- **Connections & Notifications** — request lifecycle + persisted live notifications
- **Admin** — overview stats, user management, audit logs

Socket events (all JWT-gated): `message:new`, `conversation:typing/read/updated/deleted`, `notification:new`, `ideas:changed`, `connection:request:*` — clients subscribe per-user, so every feed, badge and chat stays live.

## 📁 Project Structure

```
collab-portal/
├── backend/src
│   ├── routes/         # Express routers (auth, ideas, messages, connections, notifications, admin)
│   ├── services/       # Auth, dual-adapter storage, mail, notifications, socket hub
│   ├── middleware/     # JWT auth, RBAC, rate limiting
│   └── server.js       # HTTP + Socket.IO bootstrap
├── src
│   ├── pages/          # Dashboard, Explore, Messages, Requests, Auth, Admin, Legal…
│   ├── components/     # Navbar, Sidebar, ProjectCard, Toaster
│   ├── services/       # Fetch client with transparent token-refresh retry
│   └── App.jsx         # Shell, routing, socket + notification orchestration
└── vercel.json          # SPA rewrites + CSP/security headers
```

## 🖥️ Running Locally

Requires **Node ≥ 18.17**.

```bash
npm install
npm run dev        # frontend :5173 · backend :4000
```

Local mode runs on JSON-file storage with console-logged verification links — **no external services needed**.
Runtime configuration (JWT secrets, email provider, database) is intentionally not published; reach out if you'd like a walkthrough.

## 🤝 Contributing

Open to feedback and interesting ideas — open an issue or reach out on GitHub. `npm run build` must stay green.

## 📄 License

MIT.

## 👨‍💻 Author

**Aayush Jaiswal** — CMRIT Student
GitHub: [@Aayush-np](https://github.com/Aayush-np)

---
*Built end-to-end — design, frontend, API, realtime, infrastructure.*
