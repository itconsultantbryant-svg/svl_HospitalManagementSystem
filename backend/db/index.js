const config = require('../config');

const adapter = config.dbType === 'postgres' ? require('./postgres') : require('./sqlite');

// Dialect-aware SQL expression for "current timestamp"
// Postgres: NOW()  |  SQLite: datetime('now')
const NOW = config.dbType === 'postgres' ? 'NOW()' : "datetime('now')";

async function init() {
  if (adapter.init) return adapter.init();
  return Promise.resolve();
}

module.exports = {
  init,
  NOW,
  query: adapter.query,
  get: adapter.get,
  run: adapter.run,
};
