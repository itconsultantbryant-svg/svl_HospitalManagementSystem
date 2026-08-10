/**
 * Add U-HPCMS tables (v2-v7 + entity-docs) and super-admin to an existing Postgres DB
 * (e.g. one that already has the legacy tables). Safe to run multiple times.
 * Does NOT drop or recreate legacy tables.
 *
 * Loads in dependency order:
 *   schema-uhpcms-postgres → entity-docs → v2 → v3 → v4 → v5 → v6 → v7
 *
 * Usage: DATABASE_URL="postgres://..." node scripts/init-uhpcms-postgres.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('../config');

const DB_DIR = path.join(__dirname, '..', 'database');

const SCHEMA_FILES = [
  'schema-uhpcms-postgres.sql',
  'schema-uhpcms-entity-docs-postgres.sql',
  'schema-uhpcms-v2-postgres.sql',
  'schema-uhpcms-v3-postgres.sql',
  'schema-uhpcms-v4-postgres.sql',
  'schema-uhpcms-v5-postgres.sql',
  'schema-uhpcms-v6-postgres.sql',
  'schema-uhpcms-v7-postgres.sql',
].filter((name) => fs.existsSync(path.join(DB_DIR, name)));

/**
 * Execute a .sql file. Tries the whole file in one query first; if the driver rejects
 * multi-statement input, splits on `;` and runs each non-empty statement separately.
 */
async function execSqlFile(client, file, label) {
  const sql = fs.readFileSync(file, 'utf8');
  if (!sql.trim()) return;
  try {
    await client.query(sql);
  } catch (e) {
    if (String(e.message || '').toLowerCase().includes('another command is already in progress') ||
        String(e.message || '').toLowerCase().includes('multiple')) {
      for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
        try { await client.query(stmt); }
        catch (stmtErr) {
          console.warn(`  [warn] ${label}: statement failed: ${stmtErr.message}`);
        }
      }
      return;
    }
    throw e;
  }
}

async function init() {
  const clientConfig = config.postgres.connectionString
    ? { connectionString: config.postgres.connectionString, ssl: config.postgres.ssl }
    : {
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
        user: config.postgres.user,
        password: config.postgres.password,
      };
  const client = new Client(clientConfig);
  await client.connect();

  console.log('Applying U-HPCMS schema files...');
  for (const name of SCHEMA_FILES) {
    console.log(`  -> ${name}`);
    await execSqlFile(client, path.join(DB_DIR, name), name);
  }

  const superRoleId = 'role_super_admin';
  await client.query(
    `INSERT INTO roles (id, name, org_id) VALUES ($1, $2, NULL) ON CONFLICT (id) DO NOTHING`,
    [superRoleId, 'super_admin']
  );
  const hash = await bcrypt.hash('admin123', 10);
  const superId = 'su_1';
  await client.query(
    `INSERT INTO system_users (id, org_id, email, password_hash, role_id, full_name, status)
     VALUES ($1, NULL, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [superId, 'super@uhpcms.local', hash, superRoleId, 'Super Admin', 'active']
  );

  await client.end();
  console.log('U-HPCMS tables (v2-v7 + entity-docs) and super-admin ready.');
  console.log('Login: super@uhpcms.local / admin123');
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
