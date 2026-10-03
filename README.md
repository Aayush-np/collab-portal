# CollabHub — CMRIT Collaboration Portal

A full-stack portal for CMRIT students to post project/internship ideas, discover collaborators, connect, and chat in real time.

- **Frontend**: React + Vite (deployed on Netlify)
- **Backend**: Express + Socket.IO (deployed on Render)
- **Database**: MongoDB Atlas in production, local JSON file (`backend/data/db.json`) for dev
- **Admin panel**: role-based (superadmin / editor-admin / support-admin)

## Run locally

```powershell
npm install
npm run dev        # backend on :4000 + frontend on :5173
```

Register with any `@cmrit.ac.in` email. The address in `SUPERADMIN_EMAILS` (`.env`) becomes the superadmin.

## Deployment

See `QUICK_DEPLOY.md` (step-by-step) and `DEPLOYMENT.md` (full guide). Free stack: Netlify + Render + MongoDB Atlas.

## Security model

- **Email allow-list**: only `@cmrit.ac.in` accounts can register or log in (configurable via `ALLOWED_EMAIL_DOMAIN`).
- **Auth**: short-lived JWT access tokens + hashed, rotating, single-use refresh tokens. The server **refuses to boot in production** (`NODE_ENV=production`) if default/placeholder JWT secrets are set.
- **Authorization**: enforced server-side on every route (`requireAuth`, `requireAdmin`, `requirePermission`); admin area is hidden client-side but *secured server-side* (role checks on every `/api/admin/*` route; role changes require superadmin; all admin actions are audit-logged).
- **Passwords**: bcrypt (cost 10). Reset tokens are random 32-byte values, stored hashed, single-use, 20-minute expiry; in production they are only delivered by email (never in the API response).
- **Bot protection & abuse**: rate limiting on auth endpoints (`/login`, `/register`, `/forgot-password`, `/reset-password`), optional **Cloudflare Turnstile** CAPTCHA (enabled by setting `TURNSTILE_SECRET_KEY` on the backend and `VITE_TURNSTILE_SITE_KEY` on the frontend), input length caps on ideas/messages/profiles, and server-side escaping of search input against regex injection.
- **Realtime**: Socket.IO connections are authenticated with the same JWT access token; events only emit to conversation/connection participants.
- **Frontend**: security headers + CSP via `public/_headers` (Netlify), no secrets in client code, React-rendered UI (no `innerHTML` sinks).
- **Secrets hygiene**: `.env` and `backend/data/` are git-ignored and must never be committed.

### One-time dashboard steps (owner)

1. Render: set strong `JWT_SECRET` / `REFRESH_TOKEN_SECRET`, `DB_PROVIDER=mongo`, Atlas `MONGODB_URI`, `ALLOWED_EMAIL_DOMAIN=cmrit.ac.in`, `FRONTEND_URL`/`APP_BASE_URL` = your Netlify URL.
2. Netlify: set `VITE_API_BASE_URL`, `VITE_SOCKET_URL` (and `VITE_TURNSTILE_SITE_KEY` if using CAPTCHA); update the API origin in `netlify.toml` and `public/_headers` (CSP `connect-src`) to your Render URL; redeploy after any change.
3. Cloudflare Turnstile (optional but recommended): create a widget → add secret key to Render, site key to Netlify.
4. MongoDB Atlas: create the migration once from your local data with `npm run migrate:mongo` (with `MONGODB_URI` set), if you want to carry over local dev data.
