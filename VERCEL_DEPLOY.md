# Vercel + Neon Deployment Guide for U-HPCMS

## Architecture

| Layer | Platform | Role |
|-------|----------|------|
| **Frontend** | **Vercel** | React + Vite static SPA (CDN, preview deploys) |
| **Backend API** | **Neon Functions** | Express API as a long-running Node.js function next to the DB |
| **Database** | **Neon Lakebase Postgres** | Managed PostgreSQL (`DATABASE_URL` injected into the function) |

Render is no longer required. Keep `render.yaml` / `RENDER_DEPLOY.md` only if you need a temporary fallback.

```
Browser → Vercel (frontend)
              │  VITE_API_URL
              ▼
         Neon Function `api`  ←→  Neon Postgres (same branch)
```

---

## Prerequisites

- Neon account (this repo is prepared for project **`uhpcms-hms`**, id `patient-fog-47191385`, region **`aws-us-east-2`**)
- [Neon CLI](https://neon.com/docs/cli/install): `npm install -g neon@latest` then `neon login`
- Vercel account + GitHub repo connected
- Node.js **20+** (24 recommended; Functions run on Node 24)

---

## 1. Neon project (Postgres + Function)

### Already provisioned

| Field | Value |
|-------|--------|
| Project name | `uhpcms-hms` |
| Project ID | `patient-fog-47191385` |
| Region | `aws-us-east-2` |
| Database | `hospital` |
| Default branch | `main` (`br-restless-flower-b5vbdnky`) |

Console: https://console.neon.tech/app/projects/patient-fog-47191385

### Link the repo and pull credentials

```bash
# From repo root
npm install
cd backend && npm install && cd ..

neon link --project-id patient-fog-47191385
# or: npm run neon:link

neon env pull --file .env.neon.local
# Writes DATABASE_URL / DATABASE_URL_UNPOOLED for local scripts
```

### Initialize schema (once)

```bash
# Requires DATABASE_URL from .env.neon.local
export $(grep -v '^#' .env.neon.local | xargs)   # or: npm run db:init:neon
node backend/scripts/init-db-postgres.js
```

Idempotent — safe to re-run. Creates all tables (v2–v7 + entity-docs) and the default super-admin.

### Configure deploy secrets

```bash
cp .env.neon.example .env.neon
# Edit .env.neon:
#   JWT_SECRET=<random 32+ chars>
#   CORS_ORIGIN=https://<your-vercel-app>.vercel.app
```

`.env.neon` and `.env.neon.local` are gitignored.

### Deploy the API function

```bash
neon auth   # if CLI token expired
./scripts/deploy-neon.sh
# or: neon deploy --env .env.neon
```

This applies `neon.ts` (declares function slug **`api`**) and deploys the bundled Express app from `backend/functions/api.js`.

### Live invocation URL (current)

```
https://br-restless-flower-b5vbdnky-api.compute.c-7.us-east-2.aws.neon.tech
```

Health check (confirmed):

```bash
curl https://br-restless-flower-b5vbdnky-api.compute.c-7.us-east-2.aws.neon.tech/api/health
# → { "ok": true, "db": "postgres", "platform": "neon" }
```

Re-check after a redeploy:

```bash
neon functions get api -o yaml
```

Local function dev (hot reload against the linked branch DB):

```bash
neon dev
# API at http://localhost:8787
```

---

## 2. Frontend on Vercel

1. **Import** the GitHub repo in Vercel  
2. **Root Directory:** `frontend`  
3. **Framework Preset:** Vite (auto)  
4. **Build Command:** `npm run build`  
5. **Output Directory:** `dist`  
6. **Environment Variables** (Production + Preview):

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `https://br-restless-flower-b5vbdnky-api.compute.c-7.us-east-2.aws.neon.tech` |

7. **Deploy**

`frontend/vercel.json` already rewrites all routes to `index.html` for React Router.

**Live frontend:** [https://svl-hms.vercel.app/](https://svl-hms.vercel.app/)

After the Vercel URL is known (or changes):

1. Put that URL in `.env.neon` as `CORS_ORIGIN` / `FRONTEND_URL`  
2. Re-run `./scripts/deploy-neon.sh` (or `neon deploy --env .env.neon`)  
3. Confirm login works from the Vercel site  

---

## 3. Verify

| Check | How |
|-------|-----|
| Backend health | `curl https://<neon-function>/api/health` |
| Frontend | Open [https://svl-hms.vercel.app/](https://svl-hms.vercel.app/) → login page |
| Login | `super@uhpcms.local` / `admin123` (after `init-db-postgres`) |
| Public hospital page | `https://<vercel>/h/ORG-<id>` |
| CORS | DevTools → Network → no CORS errors |

---

## 4. Environment reference

### Neon Function (`neon.ts` → `env`, set via `.env.neon` at deploy)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | ✅ auto | Injected by Neon from the branch — do not set in `.env.neon` unless overriding |
| `DB_TYPE` | ✅ | Set to `postgres` in `neon.ts` |
| `JWT_SECRET` | ✅ | From `.env.neon` at deploy time |
| `CORS_ORIGIN` | ✅ | Exact Vercel origin, no trailing slash |
| `JWT_EXPIRES_IN` | | Default `8h` |
| `LRD_PER_USD` | | Default `193.5` |

### Vercel (frontend)

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_URL` | ✅ | Neon Function invocation origin |

---

## 5. Repo layout (Neon-related)

```
neon.ts                      # Backend-as-code: Function `api` + branch policy
backend/functions/api.js     # Neon fetch entry (Express via fetch-adapter)
backend/app.js               # Express app (shared)
backend/server.js            # Local / legacy long-running listen
.env.neon.example            # Template for JWT_SECRET + CORS_ORIGIN
frontend/vercel.json         # SPA rewrites
```

---

## 6. Common issues

| Symptom | Fix |
|---------|-----|
| CORS error | `CORS_ORIGIN` must match the Vercel URL exactly; redeploy the function |
| `404` on `/dashboard` | Confirm `frontend/vercel.json` rewrite; Root Directory = `frontend` |
| `relation … does not exist` | Run `node backend/scripts/init-db-postgres.js` with Neon `DATABASE_URL` |
| Function build fails on `sql.js` | Deploy uses Postgres-only entry; ensure `DB_TYPE=postgres` |
| Empty `JWT_SECRET` after deploy | Set it in `.env.neon` and run `neon deploy --env .env.neon` again |
| Frontend still hits Render | Update `VITE_API_URL` on Vercel and **redeploy** the frontend |

---

## 7. Network notes (Liberia: Orange, Lonestar, MTN)

- Vercel and Neon Functions both serve **HTTPS on port 443**
- No custom ports required for core features
- Optional: custom domains — Vercel for the UI, [Neon Function custom domains](https://neon.com/docs/compute/functions/custom-domains) for the API

---

## 8. Production hardening

- Protect the default Neon branch; raise compute limits in `neon.ts` when traffic grows  
- Strong unique `JWT_SECRET`; rotate if leaked  
- Neon branching for PR previews (`neon checkout`) + point preview `VITE_API_URL` at the preview function URL  
- Snapshots / restore for recovery  
- Optional: retire Render services once Neon + Vercel are stable  

---

## 9. Quick commands

```bash
# Local UI + local API against Neon DB
neon env pull --file .env.neon.local
# terminal 1
neon dev
# terminal 2
cd frontend && VITE_API_URL=http://localhost:8787 npm run dev

# Local API process (non-Function) against Neon Postgres
cd backend && DATABASE_URL="…" DB_TYPE=postgres npm start

# Production
neon deploy --env .env.neon
# Then set VITE_API_URL on Vercel to the function invocation_url and redeploy
```
