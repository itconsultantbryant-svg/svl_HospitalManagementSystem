require('dotenv').config();

// Prefer DATABASE_URL (Neon / Render / any hosted Postgres). Default to postgres when URL is set.
const databaseUrl = process.env.DATABASE_URL || (function () {
  const h = process.env.PG_HOST;
  const db = process.env.PG_DATABASE;
  const u = process.env.PG_USER;
  const p = process.env.PG_PASSWORD;
  if (!h || !db || !u) return null;
  const port = process.env.PG_PORT || '5432';
  const enc = encodeURIComponent;
  return `postgres://${enc(u)}:${enc(p || '')}@${h}:${port}/${enc(db)}`;
})();

const explicitType = (process.env.DB_TYPE || '').toLowerCase();
// If DATABASE_URL is present, use Postgres unless explicitly forced to sqlite.
const usePostgres = !!databaseUrl && explicitType !== 'sqlite';

// Allow frontend origin(s) for CORS. Comma-separated list, or true to allow all.
function getCorsOrigin() {
  const raw = process.env.CORS_ORIGIN || process.env.FRONTEND_URL;
  if (!raw || raw === 'true') return true;
  const list = raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return list.length ? list : true;
}

function needsSsl(url) {
  if (!url) return false;
  if (/[?&]sslmode=/i.test(url)) return true;
  return /neon\.tech|render\.com|sslmode=require/i.test(url)
    || /^dpg-/.test(process.env.PG_HOST || '');
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dbType: usePostgres ? 'postgres' : 'sqlite',
  jwtSecret: process.env.JWT_SECRET || 'uhpcms-default-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: getCorsOrigin(),
  // Currency: USD and LRD (Liberian Dollars). Rate LRD per 1 USD.
  currency: {
    default: 'USD',
    lrdPerUsd: parseFloat(process.env.LRD_PER_USD || '193.5'),
  },
  sqlite: {
    path: process.env.SQLITE_PATH || './data/hospital.db',
  },
  postgres: databaseUrl
    ? {
        connectionString: databaseUrl,
        // Neon connection strings usually include sslmode=require; keep rejectUnauthorized
        // false for managed hosts that use intermediary certs.
        ssl: needsSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        database: process.env.PG_DATABASE || 'hospital',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
      },
};

module.exports = config;
