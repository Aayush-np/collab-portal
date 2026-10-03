# CollabHub — Complete Deployment Guide

Deploy the full-stack app to **Netlify (frontend) + Render (backend) + MongoDB Atlas (database)**. All free tiers. Total cost: **₹0**.

---

## 📋 Quick Overview

| Layer | Platform | Free Tier |
|-------|----------|-----------|
| Frontend (React/Vite) | Netlify | ✅ Unlimited sites, 100GB bandwidth |
| Backend (Express/Socket.IO) | Render | ✅ 750 hrs/mo, sleeps after 15 min idle |
| Database (MongoDB) | MongoDB Atlas | ✅ 512 MB, shared cluster |

Architecture:
```
Browser (Netlify)
     │ HTTPS + CSP
     ▼
API (Render) ──► MongoDB Atlas
     ▲
Socket.IO (real-time chat)
```

---

## 🚀 Phase 0 — Test Locally First

```powershell
cd "D:\Mini Project\collab-portal"
npm install
npm run dev
```
- Opens: `http://localhost:5173` (frontend), `http://localhost:4000` (API)
- Register with any `@cmrit.ac.in` email
- Verify: post idea, chat, admin page
- `Ctrl+C` to stop

---

## 🚀 Phase 1 — Push to GitHub

### 1.1 Install Git (if needed)
```powershell
git --version
```
If error → https://git-scm.com/download/win → default install.

### 1.2 Create GitHub repo
- https://github.com/new
- Name: `collab-portal` → **Private** ✅ → Create (no README)

### 1.3 Upload
```powershell
cd "D:\Mini Project\collab-portal"
git init
git add -A
git status
```
**Check**: `.env` and `backend/data/` must NOT appear in the green list. If they do, STOP.

```powershell
git commit -m "CollabHub v1"
git remote add origin https://github.com/YOUR-USERNAME/collab-portal.git
git branch -M main
git push -u origin main
```
(Replace `YOUR-USERNAME`. Sign in via browser popup.)

---

## 🚀 Phase 2 — MongoDB Atlas (Database)

1. Go to https://www.mongodb.com/cloud/atlas/register → Sign up with Google
2. **+ Create** → **M0 FREE** → AWS → **Mumbai (ap-south-1)** → Name: `Cluster0` → **Create**
3. **Database Access** → **Add New Database User**:
   - Username: `collab_portal`
   - **Autogenerate Secure Password** → **COPY & SAVE NOW**
   - Create User
4. **Network Access** → **Add IP Address** → **Allow Access from Anywhere (0.0.0.0/0)** → Confirm
5. **Database** → **Connect** → **Drivers** → **Node.js** → copy connection string:
   ```
   mongodb+srv://collab_portal:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with your real password. Save the full string.

---

## 🚀 Phase 3 — Render (Backend)

### 3.1 Update `netlify.toml` first
Open `D:\Mini Project\collab-portal\netlify.toml` and `public/_headers`. Replace the placeholder backend URL with your actual Render URL **after** you get it in step 3.5. For now leave as-is (we'll fix after Render gives you the URL).

### 3.2 Create Render service
1. https://render.com → **Get Started** → **Sign up with GitHub**
2. Dashboard → **New +** → **Web Service** → Connect `collab-portal`
3. Settings:
   | Field | Value |
   |-------|-------|
   | Name | `collab-portal-api` |
   | Region | Singapore |
   | Root Dir | *(blank)* |
   | Runtime | Node |
   | Build | `npm install` |
   | Start | `npm start` |
   | Instance | **Free** ⚠️ |
4. **Advanced** → **Add Environment Variables** (paste all, replace the 3 marked `<<>>`):

```
PORT=4000
NODE_ENV=production
DB_PROVIDER=mongo
MONGODB_URI=<<YOUR FULL MONGODB STRING FROM PHASE 2>>
MONGODB_DB_NAME=collab_portal
FRONTEND_URL=https://PENDING-WILL-FIX-LATER.netlify.app
APP_BASE_URL=https://PENDING-WILL-FIX-LATER.netlify.app
JWT_SECRET=aB3$kL9#mQ2&xR7!vT5*wY1@zN4(cF8
REFRESH_TOKEN_SECRET=qW9#eR6$tY3^uI8*oP2(aS5)dG1%fH4!
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
RESET_TOKEN_EXPIRES_MINUTES=20
ALLOWED_EMAIL_DOMAIN=cmrit.ac.in
SUPERADMIN_EMAILS=aayush.cse24@cmrit.ac.in
ENABLE_GOOGLE_AUTH=0
```
(Use the two secrets above, or generate your own at https://randomkeygen.com.)

5. **Deploy Web Service** → wait 3–6 min → **Live** 🟢
6. Copy your backend URL: `https://collab-portal-api.onrender.com` (or your name)
7. Test: open `https://collab-portal-api.onrender.com/api/health` → must return `{"ok":true,"service":"collab-portal-api"}`

---

## 🚀 Phase 4 — Fix Netlify Redirects & CSP (before frontend deploy)

Now that you have your real Render URL, update two files:

**`netlify.toml`** (lines 12 and 19):
```toml
  to = "https://collab-portal-api.onrender.com/api/:splat"
  # and
  to = "https://collab-portal-api.onrender.com/socket.io/:splat"
```

**`public/_headers`** (the `connect-src` line):
```
connect-src 'self' https://collab-portal-api.onrender.com wss://collab-portal-api.onrender.com https://accounts.google.com https://challenges.cloudflare.com;
```
(Replace `collab-portal-api.onrender.com` with your actual Render URL if different.)

Then push:
```powershell
cd "D:\Mini Project\collab-portal"
git add -A
git commit -m "point netlify to real render backend"
git push
```

---

## 🚀 Phase 5 — Netlify (Frontend)

1. https://app.netlify.com → **Sign up with GitHub**
2. **Add new site** → **Import existing project** → GitHub → `collab-portal`
3. It auto-detects: Build `npm run build`, Publish `dist` → **Deploy site**
4. Wait 2–3 min → URL like `https://sparkly-otter-12345.netlify.app`
   (Optional: **Site configuration → Change site name** → e.g. `collabhub-cmrit`)

### 5.1 Add environment variables
**Site configuration → Environment variables → Add** (2 vars):
| Key | Value |
|-----|-------|
| `VITE_API_BASE_URL` | `https://collab-portal-api.onrender.com/api` *(your Render URL + /api)* |
| `VITE_SOCKET_URL` | `https://collab-portal-api.onrender.com` *(your Render URL, no /api)* |

**Then**: **Deploys** tab → **Trigger deploy** → **Deploy site** (env vars only apply on rebuild).

---

## 🚀 Phase 6 — Connect Frontend ↔ Backend (⚠️ MOST SKIPPED)

1. **Render** → your service → **Environment** (left menu)
2. Edit these two with your **real Netlify URL**:
   - `FRONTEND_URL=https://collabhub-cmrit.netlify.app`
   - `APP_BASE_URL=https://collabhub-cmrit.netlify.app`
3. **Save Changes** → Render redeploys (~2 min, wait for green)

*Without this, login fails with CORS error.*

---

## 🚀 Phase 7 — Test Live

Open `https://your-site.netlify.app`:

1. **Register** with `aayush.cse24@cmrit.ac.in` + password
2. Try a **gmail** address → should be **rejected** ✅
3. Log in → edit profile → **post an idea**
4. **Incognito window** → register `friend.cse24@cmrit.ac.in` → send connection request, accept it, **chat live** ✅
5. First account is **superadmin** (your email is in `SUPERADMIN_EMAILS`) → check **Admin** page in sidebar

🎉 **Done.** Your app is live for any CMRIT student.

---

## 🛟 Optional Free Improvements

| Problem | Free Fix |
|---------|----------|
| Render sleeps after 15 min idle → first click 30–60 sec slow | **UptimeRobot** (https://uptimerobot.com) → Add Monitor → `https://your-api.onrender.com/api/health` → 5 min interval |
| Password reset emails don't send (only logged to Render console) | Free Gmail **App Password** → fill `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=your@gmail.com`, `SMTP_PASS=your-app-password`, `MAIL_FROM=noreply@yourdomain` in Render env vars |
| Bot spam on login/register | **Cloudflare Turnstile** (free): create widget at https://dash.cloudflare.com/turnstile → add `TURNSTILE_SECRET_KEY` to Render, `VITE_TURNSTILE_SITE_KEY` to Netlify → rebuild |

---

## 🔐 Security Notes (already built in)

- Only `@cmrit.ac.in` emails can register/login (config: `ALLOWED_EMAIL_DOMAIN`)
- JWT secrets **must** be set in production (server refuses to boot with defaults)
- Rate limiting: `/login`/`/forgot`/`/reset` = 10/min, `/register` = 20/min
- Rate limiting and Turnstile CAPTCHA are opt-in via env vars
- Passwords: bcrypt cost 10; reset tokens hashed, single-use, 20-min expiry
- CSP + security headers via `public/_headers` (Netlify)
- Admin routes: server-side role checks, audit logs, superadmin-only role changes

---

## 🗂️ Important Files to Remember

| File | Purpose |
|------|---------|
| `.env` (local, never committed) | Local dev secrets |
| `.env.production.example` | Template for Render/Netlify env vars |
| `netlify.toml` | Netlify build + API redirects |
| `public/_headers` | CSP + security headers |
| `backend/data/db.json` (local only) | Local JSON database (git-ignored) |

---

## ✅ Post-Deploy Checklist

- [ ] MongoDB Atlas cluster created, user `collab_portal` with password saved
- [ ] Render service **Live** 🟢, health endpoint returns 200
- [ ] Netlify site deployed, env vars set, redeployed
- [ ] `FRONTEND_URL` + `APP_BASE_URL` in Render = real Netlify URL
- [ ] Test: register CMRIT email ✅, gmail rejected ✅
- [ ] Test: post idea, connect, chat ✅
- [ ] Admin page accessible with superadmin email ✅
- [ ] UptimeRobot monitor added (optional but recommended)

---

## 🆘 Common Issues

| Symptom | Fix |
|---------|-----|
| `CORS` error on login | `FRONTEND_URL`/`APP_BASE_URL` in Render must exactly match Netlify URL (trailing slash doesn't matter) |
| `401` on `/api/admin/*` | You're not a superadmin — check `SUPERADMIN_EMAILS` in Render matches your login email |
| `500` on search | Regex injection fix is in code — rebuild and redeploy |
| Horizontal scroll on mobile | Profile tabs now scroll; check you rebuilt after fixes |
| Admin page looks broken on tablet | Rebuilt with 4 responsive breakpoints — rebuild and redeploy |

---

## 📚 Docs in This Repo

| File | Purpose |
|------|---------|
| `README.md` | Project overview, local run, security model |
| `DEPLOYMENT.md` | **This file** — complete step-by-step deployment |
| `.env.production.example` | All production env vars template |
| `QUICK_DEPLOY.md` | (Removed — merged into this file) |
| `DEPLOYMENT_CHECKLIST.md` | (Removed — merged into this file) |
| `STITCH_*.md` | (Removed — obsolete, UI already rebuilt) |

---

## 📱 Access From Anywhere

Once deployed:
- **Frontend**: `https://your-site.netlify.app`
- **Backend API**: `https://collab-portal-api.onrender.com`
- **MongoDB**: Only accessible from your Render service

Share the Netlify URL with any CMRIT student — they can register with their `@cmrit.ac.in` email and start collaborating immediately.