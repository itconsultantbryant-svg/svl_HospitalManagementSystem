/**
 * Neon Functions entry (CommonJS) — Express hospital API next to Lakebase Postgres.
 * DATABASE_URL is injected by Neon. Default export: { fetch(request) → Response }.
 */
process.env.DB_TYPE = process.env.DB_TYPE || 'postgres';

const { toReqRes, toFetchResponse } = require('./fetch-adapter');
const db = require('../db');
const { pool } = require('../db/postgres');
const app = require('../app');
const { seedPermissions } = require('../scripts/seed-permissions');

pool.on('error', (err) => {
  // Idle disconnects are normal with Neon scale-to-zero / pooler reclaim.
  console.error('PG pool error (continuing):', err.message);
});

const ready = (async () => {
  await db.init();
  try {
    await seedPermissions();
  } catch (e) {
    console.error('Permission seed failed (continuing):', e.message);
  }
})();

module.exports = {
  async fetch(request) {
    await ready;
    const { req, res } = toReqRes(request);
    app(req, res);
    return toFetchResponse(res);
  },
};
