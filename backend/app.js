/**
 * Express application (no listen). Used by:
 * - server.js for local / Render long-running process
 * - functions/api.js for Neon Functions (fetch adapter)
 */
const express = require('express');
const cors = require('cors');
const config = require('./config');

const authRoutes = require('./routes/auth');
const employeesRoutes = require('./routes/employees');
const patientsRoutes = require('./routes/patients');
const opdRoutes = require('./routes/opd');
const statsRoutes = require('./routes/stats');
const uhpcmsAuth = require('./routes/uhpcms-auth');
const uhpcmsSettings = require('./routes/uhpcms-settings');
const governance = require('./routes/governance');
const uhpcmsBilling = require('./routes/uhpcms-billing');
const uhpcmsEncounters = require('./routes/uhpcms-encounters');
const uhpcmsPatients = require('./routes/uhpcms-patients');
const uhpcmsOrgAdmin = require('./routes/uhpcms-org-admin');
const uhpcmsTriage = require('./routes/uhpcms-triage');
const uhpcmsLab = require('./routes/uhpcms-lab');
const uhpcmsInpatient = require('./routes/uhpcms-inpatient');
const uhpcmsPharmacy = require('./routes/uhpcms-pharmacy');
const uhpcmsClinic = require('./routes/uhpcms-clinic');
const uhpcmsReporting = require('./routes/uhpcms-reporting');
const uhpcmsAudit = require('./routes/uhpcms-audit');
const uhpcmsNoticeboard = require('./routes/uhpcms-noticeboard');
const uhpcmsCases = require('./routes/uhpcms-cases');
const uhpcmsActivities = require('./routes/uhpcms-activities');
const uhpcmsSchedules = require('./routes/uhpcms-schedules');
const uhpcmsBeds = require('./routes/uhpcms-beds');
const uhpcmsInsurance = require('./routes/uhpcms-insurance');
const uhpcmsChat = require('./routes/uhpcms-chat');
const uhpcmsDocuments = require('./routes/uhpcms-documents');
const uhpcmsSearch = require('./routes/uhpcms-search');
const uhpcmsPublic = require('./routes/uhpcms-public');

const app = express();

const corsOpts = {
  ...(config.corsOrigin === true
    ? {}
    : Array.isArray(config.corsOrigin)
      ? { origin: config.corsOrigin }
      : { origin: config.corsOrigin }),
  // Neon Fetch Response rejects body on 204; cors default preflight is 204.
  optionsSuccessStatus: 200,
};
app.use(cors(corsOpts));
app.options('*', cors(corsOpts));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/opd', opdRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/uhpcms/auth', uhpcmsAuth);
app.use('/api/uhpcms/settings', uhpcmsSettings);
app.use('/api/uhpcms/governance', governance);
app.use('/api/uhpcms/billing', uhpcmsBilling);
app.use('/api/uhpcms/encounters', uhpcmsEncounters);
app.use('/api/uhpcms/patients', uhpcmsPatients);
app.use('/api/uhpcms/org-admin', uhpcmsOrgAdmin);
app.use('/api/uhpcms/triage', uhpcmsTriage);
app.use('/api/uhpcms/lab', uhpcmsLab);
app.use('/api/uhpcms/inpatient', uhpcmsInpatient);
app.use('/api/uhpcms/pharmacy', uhpcmsPharmacy);
app.use('/api/uhpcms/clinic', uhpcmsClinic);
app.use('/api/uhpcms/reporting', uhpcmsReporting);
app.use('/api/uhpcms/audit', uhpcmsAudit);
app.use('/api/uhpcms/noticeboard', uhpcmsNoticeboard);
app.use('/api/uhpcms/cases', uhpcmsCases);
app.use('/api/uhpcms/activities', uhpcmsActivities);
app.use('/api/uhpcms/schedules', uhpcmsSchedules);
app.use('/api/uhpcms/beds', uhpcmsBeds);
app.use('/api/uhpcms/insurance', uhpcmsInsurance);
app.use('/api/uhpcms/chat', uhpcmsChat);
app.use('/api/uhpcms/documents', uhpcmsDocuments);
app.use('/api/uhpcms/search', uhpcmsSearch);
app.use('/api/uhpcms/public', uhpcmsPublic);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: config.dbType, platform: process.env.NEON_BRANCH ? 'neon' : 'node' });
});

module.exports = app;
