const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModule } = require('../middleware/requireModule');
const { audit } = require('../middleware/audit');
const { requireOrgActive } = require('../middleware/orgCheck');
const ids = require('../lib/ids');

const router = express.Router();
router.use(requireAuth);
router.use(requireOrgActive);
router.use(requireModule('hospital'));

router.get('/admissions', audit('inpatient', 'list_admissions'), async (req, res) => {
  try {
    const { org_id, ward_id, status } = req.query;
    let sql = 'SELECT a.id, a.encounter_id, a.ward_id, a.bed, a.admitted_at, a.discharged_at, a.admitted_by, a.discharged_by FROM admissions a WHERE 1=1';
    const params = [];
    if (org_id) {
      sql += ' AND a.encounter_id IN (SELECT id FROM encounters WHERE org_id = $' + (params.length + 1) + ')';
      params.push(org_id);
    }
    if (ward_id) { params.push(ward_id); sql += ` AND a.ward_id = $${params.length}`; }
    if (status === 'active') sql += ' AND a.discharged_at IS NULL';
    if (status === 'discharged') sql += ' AND a.discharged_at IS NOT NULL';
    sql += ' ORDER BY a.admitted_at DESC';
    const rows = await db.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/admissions', audit('inpatient', 'admit'), async (req, res) => {
  try {
    const { encounter_id, ward_id, bed } = req.body || {};
    if (!encounter_id || !ward_id || !bed) return res.status(400).json({ ok: false, message: 'encounter_id, ward_id, bed required' });
    const id = await ids.getNextPrefixedId('admissions', 'id', 'ADM-', null, null);
    const admittedBy = req.user?.sub || req.user?.id;
    await db.run(
      'INSERT INTO admissions (id, encounter_id, ward_id, bed, admitted_by) VALUES ($1, $2, $3, $4, $5)',
      [id, encounter_id, ward_id, bed, admittedBy]
    );
    await db.run('UPDATE encounters SET status = $1 WHERE id = $2', ['admitted', encounter_id]);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/admissions/:id/discharge', audit('inpatient', 'discharge'), async (req, res) => {
  try {
    const { id } = req.params;
    const dischargedBy = req.user?.sub || req.user?.id;
    const adm = await db.get('SELECT encounter_id FROM admissions WHERE id = $1', [id]);
    if (!adm) return res.status(404).json({ ok: false, message: 'Admission not found' });
    await db.run(
      `UPDATE admissions SET discharged_at = ${db.NOW}, discharged_by = $1 WHERE id = $2`,
      [dischargedBy, id]
    );
    await db.run(`UPDATE encounters SET status = $1, closed_at = ${db.NOW} WHERE id = $2`, ['discharged', adm.encounter_id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
