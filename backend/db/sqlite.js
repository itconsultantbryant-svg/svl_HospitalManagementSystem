const path = require('path');
const fs = require('fs');
const config = require('../config');

let db = null;
let initPromise = null;

const dbPath = path.isAbsolute(config.sqlite.path)
  ? config.sqlite.path
  : path.join(__dirname, '..', config.sqlite.path);
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function toSqlitePlaceholders(sql) {
  return sql.replace(/\$(\d+)/g, () => '?');
}

function save() {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      const buf = fs.readFileSync(dbPath);
      db = new SQL.Database(buf);
    } else {
      db = new SQL.Database();
      const schemaPath = path.join(__dirname, '..', 'database', 'schema-sqlite.sql');
      const seedPath = path.join(__dirname, '..', 'database', 'seed-sqlite.sql');
      if (fs.existsSync(schemaPath)) db.exec(fs.readFileSync(schemaPath, 'utf8'));
      if (fs.existsSync(seedPath)) db.exec(fs.readFileSync(seedPath, 'utf8'));
      save();
    }
    const uhpcmsPath = path.join(__dirname, '..', 'database', 'schema-uhpcms-sqlite.sql');
    if (fs.existsSync(uhpcmsPath)) db.exec(fs.readFileSync(uhpcmsPath, 'utf8'));
    const uhpcmsV2Path = path.join(__dirname, '..', 'database', 'schema-uhpcms-v2-sqlite.sql');
    if (fs.existsSync(uhpcmsV2Path)) db.exec(fs.readFileSync(uhpcmsV2Path, 'utf8'));
    try {
      const stmt = db.prepare('ALTER TABLE encounters ADD COLUMN referral_notes TEXT');
      stmt.step();
      stmt.free();
      save();
    } catch (_) { /* column may already exist */ }
    const uhpcmsV3Path = path.join(__dirname, '..', 'database', 'schema-uhpcms-v3-sqlite.sql');
    if (fs.existsSync(uhpcmsV3Path)) db.exec(fs.readFileSync(uhpcmsV3Path, 'utf8'));
    const uhpcmsV4Path = path.join(__dirname, '..', 'database', 'schema-uhpcms-v4-sqlite.sql');
    if (fs.existsSync(uhpcmsV4Path)) db.exec(fs.readFileSync(uhpcmsV4Path, 'utf8'));
    const uhpcmsV5Path = path.join(__dirname, '..', 'database', 'schema-uhpcms-v5-sqlite.sql');
    if (fs.existsSync(uhpcmsV5Path)) db.exec(fs.readFileSync(uhpcmsV5Path, 'utf8'));
    const entityDocsPath = path.join(__dirname, '..', 'database', 'schema-uhpcms-entity-docs-sqlite.sql');
    if (fs.existsSync(entityDocsPath)) db.exec(fs.readFileSync(entityDocsPath, 'utf8'));
    const uhpcmsV7Path = path.join(__dirname, '..', 'database', 'schema-uhpcms-v7-sqlite.sql');
    if (fs.existsSync(uhpcmsV7Path)) db.exec(fs.readFileSync(uhpcmsV7Path, 'utf8'));
    const patientOrgCols = ['full_name', 'date_of_birth', 'gender', 'phone', 'address'];
    for (const col of patientOrgCols) {
      try {
        const stmt2 = db.prepare(`ALTER TABLE patient_org ADD COLUMN ${col} TEXT`);
        stmt2.step();
        stmt2.free();
        save();
      } catch (_) { /* column may already exist */ }
    }
    // v6: multi-tenant columns (idempotent per column; table columns are added once)
    const uhpcmsV6Path = path.join(__dirname, '..', 'database', 'schema-uhpcms-v6-sqlite.sql');
    if (fs.existsSync(uhpcmsV6Path)) db.exec(fs.readFileSync(uhpcmsV6Path, 'utf8'));
    const v6ColumnDefs = {
      organizations: [
        'parent_org_id TEXT',
        'logo_base64 TEXT',
        'signature_base64 TEXT',
        'address TEXT',
        'phone TEXT',
        'email TEXT',
        "country TEXT DEFAULT 'Liberia'",
        'created_by TEXT',
        "kind TEXT DEFAULT 'hospital'",
        'website_slug TEXT',
      ],
      roles: ['description TEXT', 'is_system INTEGER DEFAULT 0'],
      system_users: ['username TEXT', 'avatar_base64 TEXT'],
      audit_log: ['target_user_id TEXT', 'module_name TEXT'],
    };
    for (const [table, cols] of Object.entries(v6ColumnDefs)) {
      for (const colDef of cols) {
        try {
          const stmt3 = db.prepare(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
          stmt3.step();
          stmt3.free();
          save();
        } catch (_) { /* column may already exist */ }
      }
    }
    // Indexes that depend on v6 columns (created after the ALTERs above)
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_org_parent ON organizations(parent_org_id)');
      try {
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_org_website_slug ON organizations(website_slug) WHERE website_slug IS NOT NULL AND website_slug != \'\'');
        save();
      } catch (_) {}
      save();
    } catch (_) {}
    return db;
  })();
  return initPromise;
}

function query(sql, params = []) {
  if (!db) throw new Error('SQLite not initialized; call init() first');
  const sql2 = toSqlitePlaceholders(sql);
  const stmt = db.prepare(sql2);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  if (!db) throw new Error('SQLite not initialized; call init() first');
  const sql2 = toSqlitePlaceholders(sql);
  const stmt = db.prepare(sql2);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  let lastID;
  try {
    const r = db.exec('SELECT last_insert_rowid() as id');
    if (r[0] && r[0].values[0]) lastID = r[0].values[0][0];
  } catch (_) {}
  save();
  return { lastID, changes: db.getRowsModified() };
}

module.exports = { query, get, run, init, save };
