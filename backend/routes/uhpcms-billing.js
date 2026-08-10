const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireModule } = require('../middleware/requireModule');
const { requireOrgActive } = require('../middleware/orgCheck');
const { requireOrgContext } = require('../middleware/requireOrgContext');
const { getOrgBranding } = require('../lib/permissions');
const ids = require('../lib/ids');

const router = express.Router();

router.use(requireAuth);
router.use(requireOrgActive);
router.use(requireModule('billing'));

// GET /api/uhpcms/billing/invoices?encounter_id=  OR  ?org_id= (list all for org)
router.get('/invoices', requireOrgContext, async (req, res) => {
  try {
    const { encounter_id } = req.query;
    const orgId = req.orgId;
    if (encounter_id) {
      const rows = await db.query(
        'SELECT id, encounter_id, total_amount, currency, status, created_at, paid_at FROM invoices WHERE encounter_id = $1 ORDER BY created_at',
        [encounter_id]
      );
      return res.json({ ok: true, data: rows });
    }
    if (!orgId) return res.status(400).json({ ok: false, message: 'encounter_id or org_id required' });
    const rows = await db.query(
      `SELECT i.id, i.encounter_id, i.total_amount, i.currency, i.status, i.created_at, i.paid_at, e.patient_mrn
       FROM invoices i JOIN encounters e ON e.id = i.encounter_id WHERE e.org_id = $1 ORDER BY i.created_at DESC`,
      [orgId]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/billing/payments?org_id= (list all payments for org)
router.get('/payments', requireOrgContext, async (req, res) => {
  try {
    const orgId = req.orgId;
    const rows = await db.query(
      `SELECT p.id, p.invoice_id, p.amount, p.currency, p.method, p.reference, p.created_at, i.encounter_id, e.patient_mrn
       FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN encounters e ON e.id = i.encounter_id
       WHERE e.org_id = $1 ORDER BY p.created_at DESC`,
      [orgId]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});
router.get('/charges', async (req, res) => {
  try {
    const { encounter_id } = req.query;
    if (!encounter_id) return res.status(400).json({ ok: false, message: 'encounter_id required' });
    const rows = await db.query(
      'SELECT id, encounter_id, service_code, description, amount, currency, quantity, created_at FROM billing_charges WHERE encounter_id = $1 ORDER BY created_at',
      [encounter_id]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/billing/charges - add charge (USD only for OPD invoices)
router.post('/charges', async (req, res) => {
  try {
    const { encounter_id, service_code, description, amount, currency, quantity } = req.body || {};
    if (!encounter_id || !service_code || amount == null) {
      return res.status(400).json({ ok: false, message: 'encounter_id, service_code, amount required' });
    }
    const enc = await db.get('SELECT org_id FROM encounters WHERE id = $1', [encounter_id]);
    if (!enc) return res.status(400).json({ ok: false, message: 'Encounter not found' });
    const curr = 'USD';
    const id = await ids.getNextChargeId(enc.org_id);
    await db.run(
      'INSERT INTO billing_charges (id, encounter_id, service_code, description, amount, currency, quantity) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, encounter_id, service_code, description || null, Number(amount), curr, quantity ?? 1]
    );
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/billing/invoices - create invoice from charges (USD only for OPD)
router.post('/invoices', async (req, res) => {
  try {
    const { encounter_id } = req.body || {};
    if (!encounter_id) return res.status(400).json({ ok: false, message: 'encounter_id required' });
    const enc = await db.get('SELECT org_id FROM encounters WHERE id = $1', [encounter_id]);
    if (!enc) return res.status(400).json({ ok: false, message: 'Encounter not found' });
    const curr = 'USD';
    const charges = await db.query(
      'SELECT amount, quantity FROM billing_charges WHERE encounter_id = $1',
      [encounter_id]
    );
    const total = charges.reduce((s, c) => s + (c.amount || 0) * (c.quantity || 1), 0);
    const id = await ids.getNextInvoiceId(enc.org_id);
    await db.run(
      'INSERT INTO invoices (id, encounter_id, total_amount, currency, status) VALUES ($1, $2, $3, $4, $5)',
      [id, encounter_id, total, curr, 'pending']
    );
    res.status(201).json({ ok: true, id, total_amount: total, currency: curr });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/billing/payments - record payment (USD only for OPD invoices)
router.post('/payments', async (req, res) => {
  try {
    const { invoice_id, amount, method, reference } = req.body || {};
    if (!invoice_id || amount == null) return res.status(400).json({ ok: false, message: 'invoice_id and amount required' });
    const allowedMethods = ['cash', 'bank', 'mobile_money'];
    const paymentMethod = (method && allowedMethods.includes(String(method).toLowerCase())) ? String(method).toLowerCase() : 'cash';
    const curr = 'USD';
    const id = await ids.getNextPaymentId();
    await db.run(
      'INSERT INTO payments (id, invoice_id, amount, currency, method, reference) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, invoice_id, Number(amount), curr, paymentMethod, reference || null]
    );
    const payments = await db.query('SELECT SUM(amount) as total FROM payments WHERE invoice_id = $1', [invoice_id]);
    const inv = await db.get('SELECT total_amount FROM invoices WHERE id = $1', [invoice_id]);
    const paid = (payments[0]?.total || 0);
    const status = paid >= (inv?.total_amount || 0) ? 'paid' : 'partial';
    const paidAt = status === 'paid' ? new Date().toISOString() : null;
    await db.run(
      'UPDATE invoices SET status = $1, paid_at = $2 WHERE id = $3',
      [status, paidAt, invoice_id]
    );
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/billing/invoices/:id - single invoice with charges (for print/download)
router.get('/invoices/:id', async (req, res) => {
  try {
    const inv = await db.get(
      'SELECT i.id, i.encounter_id, i.total_amount, i.currency, i.status, i.created_at, i.paid_at, e.patient_mrn, e.org_id FROM invoices i JOIN encounters e ON e.id = i.encounter_id WHERE i.id = $1',
      [req.params.id]
    );
    if (!inv) return res.status(404).json({ ok: false, message: 'Invoice not found' });
    const charges = await db.query(
      'SELECT id, service_code, description, amount, currency, quantity FROM billing_charges WHERE encounter_id = $1 ORDER BY created_at',
      [inv.encounter_id]
    );
    const payments = await db.query(
      'SELECT id, amount, currency, method, reference, created_at FROM payments WHERE invoice_id = $1 ORDER BY created_at',
      [inv.id]
    );
    const branding = (await getOrgBranding(inv.org_id)) || {};
    res.json({ ok: true, data: { ...inv, charges: charges || [], payments: payments || [], branding } });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/billing/payments/:id - single payment (for receipt print/download)
router.get('/payments/:id', async (req, res) => {
  try {
    const row = await db.query(
      `SELECT p.id, p.invoice_id, p.amount, p.currency, p.method, p.reference, p.created_at,
        i.total_amount AS invoice_total, i.encounter_id, e.patient_mrn, e.org_id
       FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN encounters e ON e.id = i.encounter_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    const p = Array.isArray(row) ? row[0] : row;
    if (!p) return res.status(404).json({ ok: false, message: 'Payment not found' });
    const branding = (await getOrgBranding(p.org_id)) || {};
    res.json({ ok: true, data: { ...p, branding } });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/billing/encounters/:id/initial-bill - generate initial bill from org services (when patient registered/processed)
router.post('/encounters/:id/initial-bill', async (req, res) => {
  try {
    const encounterId = req.params.id;
    const enc = await db.get('SELECT id, org_id FROM encounters WHERE id = $1', [encounterId]);
    if (!enc) return res.status(404).json({ ok: false, message: 'Encounter not found' });
    const existing = await db.query('SELECT id FROM billing_charges WHERE encounter_id = $1 LIMIT 1', [encounterId]);
    if (existing && existing.length > 0) return res.status(400).json({ ok: false, message: 'Bill already has charges' });
    const services = await db.query(
      'SELECT id, code, name, default_amount, default_currency FROM services WHERE org_id = $1 AND default_amount IS NOT NULL ORDER BY code',
      [enc.org_id]
    );
    const curr = 'USD';
    for (const svc of services || []) {
      const chargeId = await ids.getNextChargeId(enc.org_id);
      await db.run(
        'INSERT INTO billing_charges (id, encounter_id, service_code, description, amount, currency, quantity) VALUES ($1, $2, $3, $4, $5, $6, 1)',
        [chargeId, encounterId, svc.code, svc.name || null, Number(svc.default_amount), svc.default_currency || curr]
      );
    }
    if (!services || services.length === 0) {
      const chargeId = await ids.getNextChargeId(enc.org_id);
      await db.run(
        'INSERT INTO billing_charges (id, encounter_id, service_code, description, amount, currency, quantity) VALUES ($1, $2, $3, $4, $5, $6, 1)',
        [chargeId, encounterId, 'REG', 'Registration / Consultation', 0, curr]
      );
    }
    res.status(201).json({ ok: true, message: 'Initial bill generated', count: services?.length || 1 });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
