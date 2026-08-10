const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModule } = require('../middleware/requireModule');
const { audit } = require('../middleware/audit');
const { requireOrgActive } = require('../middleware/orgCheck');

const router = express.Router();
router.use(requireAuth);
router.use(requireOrgActive);
router.use(requireModule(['hospital', 'clinic']));

router.get('/:encounterId', audit('triage', 'get'), async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM triage WHERE encounter_id = $1', [req.params.encounterId]);
    res.json({ ok: true, data: row });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.put('/:encounterId', audit('triage', 'record'), async (req, res) => {
  try {
    const { encounterId } = req.params;
    const { vitals, severity, notes } = req.body || {};
    const recordedBy = req.user?.sub || req.user?.id;
    const existing = await db.get('SELECT id FROM triage WHERE encounter_id = $1', [encounterId]);
    const vitalsStr = typeof vitals === 'string' ? vitals : (vitals ? JSON.stringify(vitals) : null);
    if (existing) {
      await db.run(
        `UPDATE triage SET vitals = $1, severity = $2, notes = $3, recorded_by = $4, recorded_at = ${db.NOW} WHERE encounter_id = $5`,
        [vitalsStr, severity || null, notes || null, recordedBy, encounterId]
      );
    } else {
      await db.run(
        'INSERT INTO triage (encounter_id, recorded_by, vitals, severity, notes) VALUES ($1, $2, $3, $4, $5)',
        [encounterId, recordedBy, vitalsStr, severity || null, notes || null]
      );
    }
    await db.run('UPDATE encounters SET status = $1 WHERE id = $2', ['triage', encounterId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
