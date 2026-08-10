const express = require('express');
const db = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { requireOrgActive } = require('../middleware/orgCheck');
const { requireOrgContext } = require('../middleware/requireOrgContext');

const router = express.Router();
router.use(requireAuth);
router.use(requireOrgActive);

/** GET /api/uhpcms/search?q=...&org_id=...
 * Returns patients, staff (system_users), notices, departments, encounters, invoices (org-scoped).
 */
router.get('/', requireOrgContext, async (req, res) => {
  try {
    const orgId = req.orgId;
    if (!orgId) {
      return res.json({
        ok: true,
        data: {
          patients: [],
          users: [],
          notices: [],
          departments: [],
          encounters: [],
          invoices: [],
          legacy_employees: [],
        },
      });
    }

    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({
        ok: true,
        data: {
          patients: [],
          users: [],
          notices: [],
          departments: [],
          encounters: [],
          invoices: [],
          legacy_employees: [],
        },
      });
    }

    const pattern = `%${q}%`;
    const patternLower = `%${q.toLowerCase()}%`;
    const dbType = config.dbType || 'sqlite';
    const isPg = dbType === 'postgres';
    const searchParam = isPg ? pattern : patternLower;
    const like = (col) => (isPg ? `${col} ILIKE $2` : `(LOWER(CAST(${col} AS TEXT)) LIKE $2)`);
    const params = [orgId, searchParam];

    const encLike = (col) => (isPg ? `${col} ILIKE $2` : `(LOWER(CAST(${col} AS TEXT)) LIKE $2)`);

    const [patients, users, notices, departments, encounters, invoices] = await Promise.all([
      db.query(
        `SELECT id, mrn, full_name, phone, org_id FROM patient_org WHERE org_id = $1 AND (${like('full_name')} OR ${like('mrn')} OR ${like('phone')}) ORDER BY full_name LIMIT 10`,
        params
      ),
      db.query(
        `SELECT id, email, full_name, role_id, org_id FROM system_users WHERE org_id = $1 AND status = 'active' AND (${like('full_name')} OR ${like('email')}) ORDER BY full_name, email LIMIT 10`,
        params
      ),
      db.query(
        `SELECT id, title, content, created_at, is_pinned FROM noticeboard WHERE org_id = $1 AND (${like('title')} OR ${like('content')}) ORDER BY is_pinned DESC, created_at DESC LIMIT 8`,
        params
      ),
      db.query(
        `SELECT id, name, org_id FROM departments WHERE org_id = $1 AND (${like('name')}) ORDER BY name LIMIT 8`,
        params
      ),
      db.query(
        `SELECT id, patient_mrn, status, registered_at, department_id FROM encounters WHERE org_id = $1 AND (${encLike('id')} OR ${encLike('patient_mrn')} OR ${encLike('status')}) ORDER BY registered_at DESC LIMIT 8`,
        params
      ),
      db.query(
        isPg
          ? `SELECT i.id, i.encounter_id, i.total_amount, i.currency, i.status, i.created_at
             FROM invoices i
             INNER JOIN encounters e ON e.id = i.encounter_id AND e.org_id = $1
             WHERE CAST(i.id AS TEXT) ILIKE $2 OR CAST(i.encounter_id AS TEXT) ILIKE $2
             ORDER BY i.created_at DESC LIMIT 8`
          : `SELECT i.id, i.encounter_id, i.total_amount, i.currency, i.status, i.created_at
             FROM invoices i
             INNER JOIN encounters e ON e.id = i.encounter_id AND e.org_id = $1
             WHERE LOWER(CAST(i.id AS TEXT)) LIKE $2 OR LOWER(CAST(i.encounter_id AS TEXT)) LIKE $2
             ORDER BY i.created_at DESC LIMIT 8`,
        params
      ),
    ]);

    let legacy_employees = [];
    try {
      const legacyParam = [searchParam];
      if (isPg) {
        legacy_employees = await db.query(
          `SELECT eid, "firstName", "lastName", role, "emailID", mobileno FROM employee WHERE status = 1
           AND (LOWER(TRIM(COALESCE("firstName",'') || ' ' || COALESCE("lastName",''))) LIKE $1
                OR LOWER(CAST(eid AS TEXT)) LIKE $1 OR LOWER(COALESCE("emailID",'')) LIKE $1
                OR LOWER(CAST(mobileno AS TEXT)) LIKE $1)
           ORDER BY eid LIMIT 6`,
          legacyParam
        );
      } else {
        legacy_employees = await db.query(
          `SELECT eid, firstName, lastName, role, emailID, mobileno FROM employee WHERE status = 1
           AND (LOWER(TRIM(COALESCE(firstName,'') || ' ' || COALESCE(lastName,''))) LIKE $1
                OR LOWER(CAST(eid AS TEXT)) LIKE $1 OR LOWER(COALESCE(emailID,'')) LIKE $1
                OR LOWER(CAST(mobileno AS TEXT)) LIKE $1)
           ORDER BY eid LIMIT 6`,
          legacyParam
        );
      }
    } catch (_) {
      legacy_employees = [];
    }

    res.json({
      ok: true,
      data: {
        patients: patients || [],
        users: users || [],
        notices: notices || [],
        departments: departments || [],
        encounters: encounters || [],
        invoices: invoices || [],
        legacy_employees: legacy_employees || [],
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
