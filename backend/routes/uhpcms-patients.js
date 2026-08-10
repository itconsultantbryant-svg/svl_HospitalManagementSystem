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
router.use(requireModule(['hospital', 'clinic']));

router.get('/search', requireOrgContext, audit('patient', 'search'), async (req, res) => {
  try {
    const org_id = req.orgId;
    const { mrn, pid } = req.query;
    if (!org_id) return res.status(400).json({ ok: false, message: 'org_id required' });
    let row = null;
    if (mrn) row = await db.get('SELECT * FROM patient_org WHERE org_id = $1 AND mrn = $2', [org_id, mrn]);
    else if (pid) row = await db.get('SELECT * FROM patient_org WHERE org_id = $1 AND pid = $2', [org_id, pid]);
    if (!row) return res.json({ ok: true, data: null });
    res.json({ ok: true, data: row });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.get('/next-mrn', requireOrgContext, async (req, res) => {
  try {
    const org_id = req.orgId;
    const mrn = await ids.getNextMrn(org_id);
    res.json({ ok: true, mrn });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/register', requireOrgContext, audit('patient', 'register'), async (req, res) => {
  try {
    const org_id = req.orgId;
    const { mrn, pid, full_name, date_of_birth, gender, phone, address } = req.body || {};
    if (!org_id) return res.status(400).json({ ok: false, message: 'org_id required' });
    const useMrn = mrn || (await ids.getNextMrn(org_id));
    const existing = await db.get('SELECT id FROM patient_org WHERE org_id = $1 AND mrn = $2', [org_id, useMrn]);
    if (existing) return res.status(400).json({ ok: false, message: 'MRN already exists' });
    await db.run(
      'INSERT INTO patient_org (mrn, org_id, pid, full_name, date_of_birth, gender, phone, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [useMrn, org_id, pid || null, full_name || null, date_of_birth || null, gender || null, phone || null, address || null]
    );
    res.status(201).json({ ok: true, mrn: useMrn });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.get('/', requireOrgContext, async (req, res) => {
  try {
    const org_id = req.orgId;
    const rows = await db.query(
      'SELECT id, mrn, org_id, pid, full_name, date_of_birth, gender, phone, address, created_at FROM patient_org WHERE org_id = $1 ORDER BY created_at DESC',
      [org_id]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /duplicates?full_name=&date_of_birth=&phone= - possible duplicate patients at registration
router.get('/duplicates', requireOrgContext, async (req, res) => {
  try {
    const org_id = req.orgId;
    const { full_name, date_of_birth, phone } = req.query;
    if (!org_id) return res.status(400).json({ ok: false, message: 'org_id required' });
    const conditions = [];
    const params = [org_id];
    let hasSignal = false;
    if (full_name && String(full_name).trim()) {
      hasSignal = true;
      params.push(`%${String(full_name).trim()}%`);
      conditions.push(`LOWER(full_name) LIKE LOWER($${params.length})`);
    }
    if (phone && String(phone).trim()) {
      hasSignal = true;
      params.push(String(phone).trim());
      conditions.push(`phone = $${params.length}`);
    }
    if (date_of_birth && String(date_of_birth).trim()) {
      hasSignal = true;
      params.push(String(date_of_birth).trim());
      conditions.push(`date_of_birth = $${params.length}`);
    }
    if (!hasSignal) return res.json({ ok: true, data: [] });
    const sql = `SELECT id, mrn, full_name, date_of_birth, gender, phone, created_at
      FROM patient_org WHERE org_id = $1 AND (${conditions.join(' OR ')})
      ORDER BY created_at DESC LIMIT 5`;
    const rows = await db.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /by-mrn?org_id=&mrn= - full record by org + mrn
router.get('/by-mrn', requireOrgContext, audit('patient', 'view'), async (req, res) => {
  try {
    const org_id = req.orgId;
    const { mrn } = req.query;
    if (!mrn) return res.status(400).json({ ok: false, message: 'mrn required' });
    const patient = await db.get('SELECT * FROM patient_org WHERE org_id = $1 AND mrn = $2', [org_id, mrn]);
    if (!patient) return res.status(404).json({ ok: false, message: 'Patient not found' });
    const fullRecord = await buildFullRecord(patient.org_id, patient.mrn, patient);
    res.json({ ok: true, data: fullRecord });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

async function buildFullRecord(org_id, mrn, patientRow) {
  const encounters = await db.query(
    'SELECT id, department_id, doctor_id, status, registered_at, closed_at, triage_notes, soap_notes, referral_notes FROM encounters WHERE org_id = $1 AND patient_mrn = $2 ORDER BY registered_at DESC',
    [org_id, mrn]
  );
  const result = [];
  for (const enc of encounters) {
    const [triage] = await db.query('SELECT * FROM triage WHERE encounter_id = $1', [enc.id]);
    const labOrders = await db.query('SELECT id, test_name, test_code, status, result_value, result_unit, result_at FROM lab_orders WHERE encounter_id = $1 ORDER BY ordered_at', [enc.id]);
    const prescriptions = await db.query('SELECT id, status, prescribed_at, dispensed_at FROM prescriptions WHERE encounter_id = $1 ORDER BY prescribed_at', [enc.id]);
    const prescriptionItems = {};
    for (const rx of prescriptions) {
      const items = await db.query('SELECT drug_id, quantity, dosage, duration FROM prescription_items WHERE prescription_id = $1', [rx.id]);
      prescriptionItems[rx.id] = items;
    }
    result.push({
      ...enc,
      triage: triage || null,
      lab_orders: labOrders,
      prescriptions: prescriptions.map((r) => ({ ...r, items: prescriptionItems[r.id] || [] })),
    });
  }
  const transfersFrom = await db.query(
    'SELECT pt.*, o.name as to_org_name FROM patient_transfers pt LEFT JOIN organizations o ON o.id = pt.to_org_id WHERE pt.from_org_id = $1 AND pt.from_mrn = $2 ORDER BY pt.transferred_at DESC',
    [org_id, mrn]
  );
  const transfersTo = await db.query(
    'SELECT pt.*, o.name as from_org_name FROM patient_transfers pt LEFT JOIN organizations o ON o.id = pt.from_org_id WHERE pt.to_org_id = $1 AND pt.to_mrn = $2 ORDER BY pt.transferred_at DESC',
    [org_id, mrn]
  );
  return {
    patient: patientRow,
    encounters: result,
    transfer_history: [...transfersFrom.map((t) => ({ ...t, direction: 'out' })), ...transfersTo.map((t) => ({ ...t, direction: 'in' }))].sort((a, b) => new Date(b.transferred_at || 0) - new Date(a.transferred_at || 0)),
  };
}

// GET /:id - full record by patient_org id
router.get('/:id', audit('patient', 'view'), async (req, res) => {
  try {
    const patient = await db.get('SELECT * FROM patient_org WHERE id = $1', [req.params.id]);
    if (!patient) return res.status(404).json({ ok: false, message: 'Patient not found' });
    const fullRecord = await buildFullRecord(patient.org_id, patient.mrn, patient);
    res.json({ ok: true, data: fullRecord });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PATCH /:id - update patient demographics
router.patch('/:id', audit('patient', 'update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, date_of_birth, gender, phone, address, pid } = req.body || {};
    const patient = await db.get('SELECT id, org_id FROM patient_org WHERE id = $1', [id]);
    if (!patient) return res.status(404).json({ ok: false, message: 'Patient not found' });
    const updates = [];
    const params = [];
    let n = 0;
    if (full_name !== undefined) { n++; params.push(full_name); updates.push(`full_name = $${n}`); }
    if (date_of_birth !== undefined) { n++; params.push(date_of_birth); updates.push(`date_of_birth = $${n}`); }
    if (gender !== undefined) { n++; params.push(gender); updates.push(`gender = $${n}`); }
    if (phone !== undefined) { n++; params.push(phone); updates.push(`phone = $${n}`); }
    if (address !== undefined) { n++; params.push(address); updates.push(`address = $${n}`); }
    if (pid !== undefined) { n++; params.push(pid); updates.push(`pid = $${n}`); }
    if (!updates.length) return res.status(400).json({ ok: false, message: 'No updates provided' });
    n++; params.push(id);
    await db.run(`UPDATE patient_org SET ${updates.join(', ')} WHERE id = $${n}`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// DELETE /:id - delete patient (only if no encounters)
router.delete('/:id', audit('patient', 'delete'), async (req, res) => {
  try {
    const patient = await db.get('SELECT id, org_id, mrn FROM patient_org WHERE id = $1', [req.params.id]);
    if (!patient) return res.status(404).json({ ok: false, message: 'Patient not found' });
    const enc = await db.get('SELECT id FROM encounters WHERE org_id = $1 AND patient_mrn = $2 LIMIT 1', [patient.org_id, patient.mrn]);
    if (enc) return res.status(400).json({ ok: false, message: 'Cannot delete patient with existing encounters. Archive or transfer first.' });
    await db.run('DELETE FROM patient_org WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /transfer - transfer patient to/from hospital
router.post('/transfer', audit('patient', 'transfer'), async (req, res) => {
  try {
    const { from_org_id, to_org_id, from_mrn, to_mrn, transfer_type, reason, summary_notes, create_encounter_at_dest } = req.body || {};
    if (!from_org_id || !to_org_id || !from_mrn || !transfer_type) return res.status(400).json({ ok: false, message: 'from_org_id, to_org_id, from_mrn, transfer_type required' });
    if (!['to_hospital', 'from_hospital', 'between'].includes(transfer_type)) return res.status(400).json({ ok: false, message: 'transfer_type must be to_hospital, from_hospital, or between' });
    const sourcePatient = await db.get('SELECT * FROM patient_org WHERE org_id = $1 AND mrn = $2', [from_org_id, from_mrn]);
    if (!sourcePatient) return res.status(404).json({ ok: false, message: 'Source patient not found' });
    let destMrn = to_mrn || from_mrn;
    let encounterIdAtDest = null;
    const destOrgExists = await db.get('SELECT id, mrn FROM patient_org WHERE org_id = $1 AND mrn = $2', [to_org_id, destMrn]);
    if (!destOrgExists) {
      destMrn = await ids.getNextMrn(to_org_id);
      await db.run(
        'INSERT INTO patient_org (mrn, org_id, pid, full_name, date_of_birth, gender, phone, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [destMrn, to_org_id, sourcePatient.pid || null, sourcePatient.full_name || null, sourcePatient.date_of_birth || null, sourcePatient.gender || null, sourcePatient.phone || null, sourcePatient.address || null]
      );
      if (create_encounter_at_dest) {
        const encId = await ids.getNextEncounterId(to_org_id);
        await db.run(
          'INSERT INTO encounters (id, org_id, patient_mrn, status, triage_notes, soap_notes) VALUES ($1, $2, $3, $4, $5, $6)',
          [encId, to_org_id, destMrn, 'registered', summary_notes || null, `Transfer from ${sourcePatient.mrn} (${from_org_id}). ${reason || ''}`]
        );
        encounterIdAtDest = encId;
      }
    } else {
      destMrn = destOrgExists.mrn;
    }
    const transferId = await ids.getNextTransferId();
    const transferredBy = req.user?.sub || req.user?.id;
    await db.run(
      'INSERT INTO patient_transfers (id, from_org_id, to_org_id, from_mrn, to_mrn, transfer_type, reason, summary_notes, encounter_id_at_dest, transferred_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [transferId, from_org_id, to_org_id, from_mrn, destMrn, transfer_type, reason || null, summary_notes || null, encounterIdAtDest, transferredBy]
    );
    res.status(201).json({ ok: true, id: transferId, to_mrn: destMrn, encounter_id_at_dest: encounterIdAtDest });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
