const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModule } = require('../middleware/requireModule');
const { audit } = require('../middleware/audit');
const { requireOrgActive } = require('../middleware/orgCheck');
const { requireOrgContext } = require('../middleware/requireOrgContext');
const ids = require('../lib/ids');

const router = express.Router();
router.use(requireAuth);
router.use(requireOrgActive);
router.use(requireModule('pharmacy'));

router.get('/drugs', requireOrgContext, async (req, res) => {
  try {
    const org_id = req.orgId;
    const rows = await db.query('SELECT id, org_id, name, code, unit FROM drugs WHERE org_id = $1 ORDER BY name', [org_id]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/drugs', requireOrgContext, audit('pharmacy', 'create_drug'), async (req, res) => {
  try {
    const { name, code, unit } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, message: 'name required' });
    const org_id = req.orgId;
    const id = await ids.getNextPrefixedId('drugs', 'id', 'DRUG-', 'org_id', org_id);
    await db.run('INSERT INTO drugs (id, org_id, name, code, unit) VALUES ($1, $2, $3, $4, $5)', [id, org_id, name, code || null, unit || 'unit']);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.get('/prescriptions', audit('pharmacy', 'list_prescriptions'), async (req, res) => {
  try {
    const { status, encounter_id } = req.query;
    let sql = 'SELECT p.id, p.encounter_id, p.prescribed_by, p.prescribed_at, p.status, p.store_id, p.dispensed_at, p.dispensed_by FROM prescriptions p WHERE 1=1';
    const params = [];
    if (status) { params.push(status); sql += ` AND p.status = $${params.length}`; }
    if (encounter_id) { params.push(encounter_id); sql += ` AND p.encounter_id = $${params.length}`; }
    sql += ' ORDER BY p.prescribed_at DESC';
    const rows = await db.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/prescriptions', audit('pharmacy', 'create_prescription'), async (req, res) => {
  try {
    const { encounter_id, items } = req.body || {};
    if (!encounter_id || !Array.isArray(items) || !items.length) return res.status(400).json({ ok: false, message: 'encounter_id and items[] required' });
    const enc = await db.get('SELECT org_id FROM encounters WHERE id = $1', [encounter_id]);
    if (!enc) return res.status(400).json({ ok: false, message: 'Encounter not found' });
    const id = await ids.getNextPrescriptionId(enc.org_id);
    const prescribedBy = req.user?.sub || req.user?.id;
    await db.run('INSERT INTO prescriptions (id, encounter_id, prescribed_by, status) VALUES ($1, $2, $3, $4)', [id, encounter_id, prescribedBy, 'pending']);
    for (const it of items) {
      const itemId = await ids.getNextPrefixedId('prescription_items', 'id', 'RXI-', null, null);
      await db.run(
        'INSERT INTO prescription_items (id, prescription_id, drug_id, quantity, dosage, duration) VALUES ($1, $2, $3, $4, $5, $6)',
        [itemId, id, it.drug_id, it.quantity || 1, it.dosage || null, it.duration || null]
      );
    }
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.get('/prescriptions/:id/items', async (req, res) => {
  try {
    const rows = await db.query(
      'SELECT pi.id, pi.prescription_id, pi.drug_id, pi.quantity, pi.dosage, pi.duration, d.name as drug_name FROM prescription_items pi JOIN drugs d ON d.id = pi.drug_id WHERE pi.prescription_id = $1',
      [req.params.id]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.patch('/prescriptions/:id/dispense', audit('pharmacy', 'dispense'), async (req, res) => {
  try {
    const { id } = req.params;
    const { store_id } = req.body || {};
    const dispensedBy = req.user?.sub || req.user?.id;
    await db.run(
      `UPDATE prescriptions SET status = $1, store_id = $2, dispensed_at = ${db.NOW}, dispensed_by = $3 WHERE id = $4`,
      ['dispensed', store_id || null, dispensedBy, id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.get('/inventory', async (req, res) => {
  try {
    const store_id = req.query.store_id;
    if (!store_id) return res.status(400).json({ ok: false, message: 'store_id required' });
    const rows = await db.query(
      'SELECT i.id, i.store_id, i.drug_id, i.quantity, i.batch, i.expiry, i.updated_at, d.name as drug_name FROM pharmacy_inventory i JOIN drugs d ON d.id = i.drug_id WHERE i.store_id = $1 ORDER BY d.name',
      [store_id]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/inventory', audit('pharmacy', 'update_inventory'), async (req, res) => {
  try {
    const { store_id, drug_id, quantity, batch, expiry } = req.body || {};
    if (!store_id || !drug_id || quantity == null) return res.status(400).json({ ok: false, message: 'store_id, drug_id, quantity required' });
    const existing = await db.get('SELECT id, quantity FROM pharmacy_inventory WHERE store_id = $1 AND drug_id = $2 AND (batch = $3 OR (batch IS NULL AND $3 IS NULL))', [store_id, drug_id, batch || null]);
    if (existing) {
      await db.run(`UPDATE pharmacy_inventory SET quantity = quantity + $1, updated_at = ${db.NOW} WHERE id = $2`, [Number(quantity), existing.id]);
    } else {
      await db.run(
        'INSERT INTO pharmacy_inventory (store_id, drug_id, quantity, batch, expiry) VALUES ($1, $2, $3, $4, $5)',
        [store_id, drug_id, Number(quantity), batch || null, expiry || null]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
