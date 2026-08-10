# Vercel + Render Deployment Guide for U-HPCMS

## Architecture
- **Frontend** (React + Vite): Deployed on **Vercel** as a static site
- **Backend** (Node.js/Express): Deployed on **Render** as a web service with **PostgreSQL**
- **Database**: PostgreSQL on Render (free tier)
- **Connectivity**: HTTPS on both ends — works on all networks (Orange, Lonestar, etc.)

---

## Prerequisites
- GitHub repo connected to both Vercel and Render
- Render Blueprint (`render.yaml`) at repo root
- Frontend `vercel.json` for SPA routing

---

## 1. Deploy Backend on Render (via Blueprint)

1. In Render Dashboard → **New** → **Blueprint**
2. Connect your GitHub repo
3. Render detects `render.yaml` and proposes:
   - Database: `hms-liberia-db` (PostgreSQL, free)
   - Service: `hms-liberia-api` (Node.js web service)
   - Service: `hms-liberia` (static site)
4. Click **Apply** — this provisions the DB and starts both deploys

### What the Blueprint does automatically
- Provisions PostgreSQL database
- Deploys backend with `DB_TYPE=postgres` and `DATABASE_URL` from the DB
- **Runs `postDeployCommand: node scripts/init-db-postgres.js`** on every deploy to create all schema tables (v2–v7 + entity-docs)
- Generates `JWT_SECRET`
- Sets `CORS_ORIGIN` to empty (you fill this in after first deploy)
- Deploys frontend as static site with SPA rewrite (`vercel.json` + Render routes)

---

## 2. Configure CORS and API URLs (after first deploy)

Once both services are live:

| Service | Variable | Value |
|---------|----------|-------|
| Backend (`hms-liberia-api`) | `CORS_ORIGIN` | Your frontend URL, e.g. `https://hms-liberia.onrender.com` |
| Frontend (`hms-liberia`) | `VITE_API_URL` | Your backend URL, e.g. `https://hms-liberia-api.onrender.com` |

**Then redeploy both services** (or trigger a manual deploy).

> **Tip:** If you prefer Vercel for the frontend, set `VITE_API_URL` in Vercel project settings → Environment Variables instead.

---

## 3. Verify the Deployment

| Check | How |
|-------|-----|
| Backend health | `curl https://hms-liberia-api.onrender.com/api/health` → `{ "ok": true, "db": "postgres" }` |
| Frontend loads | Open `https://hms-liberia.onrender.com` (or Vercel URL) → Login page appears |
| Login works | `super@uhpcms.local` / `admin123` (super-admin) |
| Public site works | `https://hms-liberia.onrender.com/h/ORG-<id>` → branded hospital page |
| CORS ok | Open browser DevTools → Network → no CORS errors on API calls |

---

## 4. Optional: Frontend on Vercel instead of Render Static Site

If you prefer Vercel for the frontend (faster global CDN, preview deployments):

1. **In Vercel:** Import the same GitHub repo
2. **Framework Preset:** Vite
3. **Build Command:** `npm run build` (auto-detected)
4. **Output Directory:** `dist`
5. **Environment Variables:** Add `VITE_API_URL=https://hms-liberia-api.onrender.com`
6. **Deploy**

The `vercel.json` rewrite rule handles React Router SPA routing.

---

## 5. Network Compatibility (Orange, Lonestar, MTN Liberia)

- Both **Vercel** and **Render** serve over **HTTPS on standard ports (443)**.
- No custom ports, no WebSockets required for core features.
- Works on **all Liberian mobile networks** (Orange Liberia, Lonestar, MTN Liberia) and fixed broadband.
- If you hit corporate firewall issues: both providers support custom domains (e.g., `api.hospital.gov.lr`, `hospital.gov.lr`).

---

## 6. Manual DB Initialization (if needed)

```bash
# In Render backend service → Shell
node scripts/init-db-postgres.js
```

This is idempotent — safe to run multiple times.

---

## 7. Environment Variables Reference

### Backend (Render)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | From Render Postgres (auto via Blueprint) |
| `DB_TYPE` | ✅ | `postgres` (set in Blueprint) |
| `JWT_SECRET` | ✅ | Auto-generated in Blueprint |
| `CORS_ORIGIN` | ✅ | Frontend URL (set manually after deploy) |
| `NODE_ENV` | | `production` (set in Blueprint) |
| `PORT` | | Render sets automatically (default 3000) |

### Frontend (Vercel or Render)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ✅ | Backend URL, e.g. `https://hms-liberia-api.onrender.com` |

---

## 8. Common Issues

| Symptom | Fix |
|---------|-----|
| `CORS error` in browser | Ensure `CORS_ORIGIN` on backend matches frontend URL **exactly** (no trailing slash) |
| `404 on /dashboard` (Vercel) | Verify `vercel.json` has the rewrite rule |
| `relation "public_appointments" does not exist` | Run `node scripts/init-db-postgres.js` in backend shell |
| `JWT_SECRET not set` | Blueprint generates it; if missing, add a random 32+ char string |
| Frontend shows old API URL | Redeploy frontend after setting `VITE_API_URL` |

---

## 9. Production Hardening (Recommended)

- Move to **paid Render plans** for: persistent DB, no spin-down, custom domains, more CPU/RAM
- Add **custom domain** on Render → `api.yourhospital.org` and on Vercel → `yourhospital.org`
- Enable **Render managed TLS** (automatic) or bring your own cert
- Set up **Render cron job** for nightly DB backup (paid plans)
- Configure **Vercel preview deployments** for PR reviews

---

## 10. Quick Commands

```bash
# Local dev (SQLite)
cd backend && DB_TYPE=sqlite npm start
cd frontend && npm run dev

# Local dev (PostgreSQL via Docker)
docker run --name pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=hospital -p 5432:5432 -d postgres
cd backend && DATABASE_URL=postgres://postgres:postgres@localhost:5432/hospital DB_TYPE=postgres npm start

# Production deploy via Blueprint
# Just push to main — Render auto-deploys (if "Auto-Deploy" enabled in service settings)
```