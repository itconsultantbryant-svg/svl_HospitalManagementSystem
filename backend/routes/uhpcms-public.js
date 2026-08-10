const express = require('express');
const db = require('../db');
const ids = require('../lib/ids');
const { getOrgBranding, resolveWebsiteSlug } = require('../lib/permissions');

const router = express.Router();

// All routes here are intentionally public — no auth middleware.
// They serve the branded public hospital website at /h/:orgId.

// GET /api/uhpcms/public/:slugOrId/info — org branding + contact info for the public page
// Accepts website_slug or org ID
router.get('/:slugOrId/info', async (req, res) => {
  try {
    const orgId = await resolveWebsiteSlug(req.params.slugOrId);
    if (!orgId) return res.status(404).json({ ok: false, message: 'Organization not found' });
    const branding = await getOrgBranding(orgId);
    if (!branding) return res.status(404).json({ ok: false, message: 'Organization not found' });
    res.json({
      ok: true,
      data: {
        id: branding.id,
        name: branding.name,
        kind: branding.kind,
        type: branding.type,
        logo: branding.logo,
        address: branding.address,
        phone: branding.phone,
        email: branding.email,
        country: branding.country,
        website_slug: branding.website_slug,
        parent_name: branding.parent_name,
        status: branding.status,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/public/:slugOrId/departments — public list of departments
router.get('/:slugOrId/departments', async (req, res) => {
  try {
    const orgId = await resolveWebsiteSlug(req.params.slugOrId);
    if (!orgId) return res.status(404).json({ ok: false, message: 'Organization not found' });
    const rows = await db.query(
      'SELECT id, name FROM departments WHERE org_id = $1 ORDER BY name',
      [orgId]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/public/:slugOrId/doctors — public list of active doctors
router.get('/:slugOrId/doctors', async (req, res) => {
  try {
    const orgId = await resolveWebsiteSlug(req.params.slugOrId);
    if (!orgId) return res.status(404).json({ ok: false, message: 'Organization not found' });
    const rows = await db.query(
      `SELECT u.id, u.full_name, u.email, u.department_id, d.name AS department_name
       FROM system_users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.org_id = $1 AND u.status = 'active'
         AND (u.role_id LIKE 'role_doctor_%' OR LOWER(COALESCE(r.name, '')) LIKE '%doctor%')
       ORDER BY u.full_name`,
      [orgId]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/public/:slugOrId/appointments — public appointment request (no login)
router.post('/:slugOrId/appointments', async (req, res) => {
  try {
    const orgId = await resolveWebsiteSlug(req.params.slugOrId);
    if (!orgId) return res.status(404).json({ ok: false, message: 'Organization not found' });
    const org = await db.get('SELECT id, status FROM organizations WHERE id = $1', [orgId]);
    if (!org) return res.status(404).json({ ok: false, message: 'Organization not found' });
    if (org.status === 'inactive') return res.status(400).json({ ok: false, message: 'Organization is not accepting appointments' });
    const { full_name, phone, email, message, department_id, doctor_id, preferred_date } = req.body || {};
    if (!full_name || !String(full_name).trim()) {
      return res.status(400).json({ ok: false, message: 'full_name is required' });
    }
    const id = await ids.getNextPrefixedId('public_appointments', 'id', 'PAPT-', 'org_id', orgId);
    await db.run(
      `INSERT INTO public_appointments (id, org_id, full_name, phone, email, message, department_id, doctor_id, preferred_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', ${db.NOW})`,
      [id, orgId, String(full_name).trim(), phone || null, email || null, message || null,
        department_id || null, doctor_id || null, preferred_date || null]
    );
    res.status(201).json({ ok: true, id, status: 'pending' });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
