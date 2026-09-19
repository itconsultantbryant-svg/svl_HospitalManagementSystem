require('dotenv').config();

// Keep process alive on uncaught errors; log and let PM2 restart if needed
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const config = require('./config');
const db = require('./db');
const app = require('./app');
const { seedPermissions } = require('./scripts/seed-permissions');

async function start() {
  await db.init();
  try {
    await seedPermissions();
  } catch (e) {
    console.error('Permission seed failed (continuing):', e.message);
  }
  const server = app.listen(config.port, () => {
    console.log(`Hospital Management API running at http://localhost:${config.port} (DB: ${config.dbType})`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Stop the other process or set PORT in .env`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
