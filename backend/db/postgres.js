const { Pool } = require('pg');
const config = require('../config');

const poolConfig = config.postgres.connectionString
  ? {
      connectionString: config.postgres.connectionString,
      ssl: config.postgres.ssl,
      // Neon Functions keep a long-lived isolate — keep the pool small.
      max: parseInt(process.env.PG_POOL_MAX || '5', 10),
    }
  : {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    };

const pool = new Pool(poolConfig);

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return {
    lastID: result.rows[0]?.id,
    changes: result.rowCount,
  };
}

module.exports = { query, get, run, pool };
