# Deploying HMS Liberia on Render

> **Preferred stack:** [Vercel + Neon](./VERCEL_DEPLOY.md) (frontend on Vercel, API + Postgres on Neon Functions / Lakebase). Use this Render guide only as a legacy or temporary fallback.

This guide walks you through deploying the Hospital Management System (backend API + frontend) on [Render](https://render.com).

## Option A: Blueprint (recommended)

1. **Connect the repo to Render**
   - Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
   - Connect your GitHub/GitLab repo (e.g. `careerscopeelib/hms_liberia`).
   - Render will read `render.yaml` and create:
     - A **PostgreSQL** database (`hms-liberia-db`).
     - A **Web Service** for the API (`hms-liberia-api`, from `backend/`).
     - A **Static Site** for the frontend (`hms-liberia`, from `frontend/`).

2. **Set environment variables**
   - After the first deploy, open the **hms-liberia-api** service → **Environment**.
   - Set **CORS_ORIGIN** to your frontend URL (e.g. `https://hms-liberia.onrender.com`).
   - **Database:** Set **DATABASE_URL** to your Postgres connection string (from **hms-liberia-db** → **Info** → **Internal Database URL**). Or set **PG_HOST**, **PG_DATABASE**, **PG_USER**, **PG_PASSWORD** (and optionally **PG_PORT**); the app will build the connection and use SSL for Render hosts.
   - Open the **hms-liberia** (frontend) service → **Environment**.
   - Set **VITE_API_URL** to your backend URL (e.g. `https://hms-liberia-api.onrender.com`).  
     (No trailing slash.)
   - Redeploy the frontend so the build picks up `VITE_API_URL`.

3. **Initialize the database (one-time)**
   - In Render Dashboard, open **hms-liberia-db** and copy the **Internal Database URL** (or use the **External** URL if you run from your machine).
   - Open **hms-liberia-api** → **Shell** (or use your local terminal with the same URL).
   - Run — **paste your actual URL** (do not leave `postgres://...` as-is or you’ll get `ENOTFOUND`):
     ```bash
     cd backend
     export DATABASE_URL="postgres://USER:PASSWORD@HOST/DATABASE"   # paste the real Internal URL from hms-liberia-db
     node scripts/init-db-postgres.js
     ```
   - **Tip:** In the API service Shell, `DATABASE_URL` is often already set. Run `echo $DATABASE_URL`; if it shows a URL, skip the export and run `node scripts/init-db-postgres.js` or `npm run init-uhpcms:postgres` directly.
   - This creates the legacy HMS tables, U-HPCMS tables (`system_users`, `roles`, `organizations`, `audit_log`, etc.), and seeds a **super-admin** user so email/password login works.
   - **If you already ran the init earlier and get “relation \"system_users\" does not exist”:** run only the U-HPCMS part so you don’t overwrite legacy data: `npm run init-uhpcms:postgres` (or `node scripts/init-uhpcms-postgres.js`) with `DATABASE_URL` set. This creates the U-HPCMS tables and the super-admin user.

4. **Open the app**
   - Frontend: `https://hms-liberia.onrender.com` (or the URL Render shows).
   - Backend health: `https://hms-liberia-api.onrender.com/api/health`.
   - **U-HPCMS (super-admin):** Switch to “U-HPCMS” on the login page → Email: `super@uhpcms.local`, Password: `admin123`.
   - **Legacy HMS:** Role: Administrator, Username: `root123`, Password: `root1234` (or other seeded users from `seed-postgres.sql`).

---

## Option B: Manual setup

### Backend (Web Service)

1. **New** → **Web Service**; connect the repo.
2. **Root Directory:** `backend`.
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. **Environment:**
   - **DATABASE_URL** – from a Render PostgreSQL instance (create from **New** → **PostgreSQL** and use its connection string), **or** leave unset to use SQLite (ephemeral on free tier).
   - **JWT_SECRET** – generate a random string (e.g. `openssl rand -base64 32`).
   - **CORS_ORIGIN** – your frontend URL (e.g. `https://hms-liberia.onrender.com`).
6. After first deploy, run the database init once (see step 3 in Option A) if using Postgres.

### Frontend (Static Site)

1. **New** → **Static Site**; connect the same repo.
2. **Root Directory:** `frontend`
3. **Build Command:** `npm install && npm run build`
4. **Publish Directory:** `dist`
5. **Environment:**
   - **VITE_API_URL** – your backend URL (e.g. `https://hms-liberia-api.onrender.com`). Must be set before building.
6. Add a **Rewrite** rule: source `/*`, destination `/index.html` (for client-side routing).

---

## Environment reference

| Variable        | Service  | Description |
|----------------|----------|-------------|
| `PORT`         | Backend  | Set by Render; do not override. |
| `DATABASE_URL`| Backend  | Full PostgreSQL connection string (from Render Postgres). |
| `PG_HOST`     | Backend  | Optional. Postgres host (e.g. `dpg-xxx-a.oregon-postgres.render.com`). If set with `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`, the app builds the connection URL. |
| `PG_DATABASE` | Backend  | Optional. Postgres database name. |
| `PG_USER`     | Backend  | Optional. Postgres user. |
| `PG_PASSWORD` | Backend  | Optional. Postgres password. |
| `DB_TYPE`     | Backend  | Omit when using `DATABASE_URL` or `PG_*`; otherwise `sqlite` or `postgres`. |
| `JWT_SECRET`   | Backend  | Secret for JWT; use a strong random value in production. |
| `CORS_ORIGIN`  | Backend  | Frontend origin (e.g. `https://hms-liberia.onrender.com`). |
| `VITE_API_URL` | Frontend | Backend API URL (e.g. `https://hms-liberia-api.onrender.com`). Set before build. |

---

## Troubleshooting: Login not working

If users cannot log in after deployment:

1. **API URL**
   - **Frontend:** Set **VITE_API_URL** to the backend URL (e.g. `https://hms-liberia-api.onrender.com`) in the frontend service Environment, then **redeploy** the frontend so the build picks it up.
   - If you use the default Render naming (`hms-liberia` for frontend, `hms-liberia-api` for backend), the app will try to guess the API URL at runtime when `VITE_API_URL` is missing (e.g. `hms-liberia.onrender.com` → `hms-liberia-api.onrender.com`). For reliability, set **VITE_API_URL** and redeploy.

2. **CORS**
   - **Backend:** Set **CORS_ORIGIN** to the exact frontend URL (e.g. `https://hms-liberia.onrender.com`) with no trailing slash. You can set multiple origins as a comma-separated list.
   - Redeploy the backend after changing **CORS_ORIGIN**.

3. **Database**
   - Ensure the Postgres DB is initialized (see “Initialize the database” above). **Legacy login** uses the `login` table; **U-HPCMS/super-admin login** uses the `system_users` table. If you see “relation \"system_users\" does not exist”, run `node scripts/init-db-postgres.js` once with `DATABASE_URL` set so U-HPCMS tables and the super-admin user are created.
   - **If you see “relation \"patient_org\" does not exist”:** Re-run the U-HPCMS init so the missing tables are created (safe to run again). Use the **real** Database URL — do not use a placeholder like `postgres://...`:
     ```bash
     cd backend
     export DATABASE_URL="postgres://USER:PASSWORD@HOST/DATABASE"   # paste actual Internal URL from hms-liberia-db
     npm run init-uhpcms:postgres
     ```
     If you're in the API service Shell, `DATABASE_URL` may already be set; try `npm run init-uhpcms:postgres` without exporting. Ensure the latest code is deployed so the schema includes `patient_org`, `encounters`, etc.

4. **Browser**
   - Open DevTools → Network and try logging in. If the request to `/api/auth/login` goes to the frontend origin (e.g. `https://hms-liberia.onrender.com`) instead of the API, **VITE_API_URL** was not set at build time—set it and redeploy the frontend.

---

## Notes

- **Free tier:** Backend and DB may spin down after inactivity; first request can be slow.
- **SQLite:** If you don’t attach a Postgres DB, the backend uses SQLite. On Render the filesystem is ephemeral, so data is lost on redeploy. Use Postgres for production.
- **U-HPCMS:** The same init script (`node scripts/init-db-postgres.js`) creates U-HPCMS tables (`system_users`, `roles`, `organizations`, `audit_log`, etc.) and seeds the super-admin (`super@uhpcms.local` / `admin123`). Use the “U-HPCMS” tab on the login page for super-admin.
