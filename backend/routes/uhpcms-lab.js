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
router.use(requireModule('lab'));

router.get('/', audit('lab', 'list'), async (req, res) => {
  try {
    const { status, encounter_id } = req.query;
    let sql = 'SELECT id, encounter_id, ordered_by, ordered_at, status, test_name, test_code, result_value, result_unit, result_at, result_by FROM lab_orders WHERE 1=1';
    const params = [];
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    if (encounter_id) { params.push(encounter_id); sql += ` AND encounter_id = $${params.length}`; }
    sql += ' ORDER BY ordered_at DESC';
    const rows = await db.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/', audit('lab', 'order'), async (req, res) => {
  try {
    const { encounter_id, test_name, test_code } = req.body || {};
    if (!encounter_id || !test_name) return res.status(400).json({ ok: false, message: 'encounter_id and test_name required' });
    const enc = await db.get('SELECT org_id FROM encounters WHERE id = $1', [encounter_id]);
    if (!enc) return res.status(400).json({ ok: false, message: 'Encounter not found' });
    const id = await ids.getNextLabOrderId(enc.org_id);
    const orderedBy = req.user?.sub || req.user?.id;
    await db.run(
      'INSERT INTO lab_orders (id, encounter_id, ordered_by, test_name, test_code, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, encounter_id, orderedBy, test_name, test_code || null, 'pending']
    );
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.patch('/:id/status', audit('lab', 'update_status'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ ok: false, message: 'status required' });
    await db.run('UPDATE lab_orders SET status = $1 WHERE id = $2', [status, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.patch('/:id/result', audit('lab', 'submit_result'), async (req, res) => {
  try {
    const { id } = req.params;
    const { result_value, result_unit } = req.body || {};
    const resultBy = req.user?.sub || req.user?.id;
    await db.run(
      `UPDATE lab_orders SET result_value = $1, result_unit = $2, result_at = ${db.NOW}, result_by = $3, status = $4 WHERE id = $5`,
      [result_value || null, result_unit || null, resultBy, 'result_ready', id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
