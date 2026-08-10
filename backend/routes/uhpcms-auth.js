const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { getPermissionsForUser, getOrgBranding } = require('../lib/permissions');

const router = express.Router();

function deriveRoleName(roleId) {
  if (!roleId || typeof roleId !== 'string') return roleId;
  const s = roleId.replace(/^role_/, '');
  return s.replace(/_org_[a-zA-Z0-9_]+$/, '') || s || roleId;
}

// GET /api/uhpcms/auth/org-branding?org_id=...|email=... - public pre-login branding resolution
// Resolves an org's branding from an org id, or from a user's email, so the login
// page can show the hospital logo/name before the user submits credentials.
router.get('/org-branding', async (req, res) => {
  try {
    const { org_id, email } = req.query || {};
    let branding = null;
    if (org_id) {
      branding = await getOrgBranding(org_id);
    } else if (email && typeof email === 'string') {
      const userRow = await db.get(
        'SELECT org_id FROM system_users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1',
        [email]
      );
      if (userRow?.org_id) branding = await getOrgBranding(userRow.org_id);
    }
    return res.json({ ok: true, branding });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/auth/login - body: { email, password } or legacy { role, username, password }
// Returns JWT and user context (org, role, permissions)
router.post('/login', async (req, res) => {
  try {
    const { email, password, role, username } = req.body || {};
    let userRow = null;
    let isLegacy = false;

    if (email && password) {
      userRow = await db.get(
        'SELECT id, org_id, email, password_hash, role_id, full_name, status FROM system_users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND status = $2',
        [email, 'active']
      );
      if (userRow) {
        const valid = await bcrypt.compare(password, userRow.password_hash);
        if (!valid) return res.status(401).json({ ok: false, message: 'Invalid credentials' });
      }
    }

    if (!userRow && role && req.body.password) {
      isLegacy = true;
      const legacy = await db.get(
        'SELECT id, role, username, password FROM login WHERE role = $1 AND username = $2',
        [role, username]
      );
      if (!legacy || !legacy.password) return res.status(401).json({ ok: false, message: 'Invalid credentials' });
      const valid = await bcrypt.compare(req.body.password, legacy.password);
      if (!valid) return res.status(401).json({ ok: false, message: 'Invalid credentials' });
      userRow = { id: legacy.id, role: legacy.role, username: legacy.username, org_id: null, role_id: legacy.role };
    }

    if (!userRow) {
      try {
        db.run(
          'INSERT INTO audit_log (user_id, org_id, module, action, payload) VALUES ($1, $2, $3, $4, $5)',
          [null, null, 'auth', 'login_failed', JSON.stringify({ identifier: email || username || 'unknown' })]
        );
      } catch (_) {}
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    let orgActive = null;
    try {
      if (userRow.org_id) {
        orgActive = await db.get('SELECT status FROM organizations WHERE id = $1', [userRow.org_id]);
      }
    } catch (_) {}
    if (userRow.org_id && orgActive?.status === 'suspended') {
      try {
        db.run(
          'INSERT INTO audit_log (user_id, org_id, module, action, payload) VALUES ($1, $2, $3, $4, $5)',
          [userRow.id, userRow.org_id, 'auth', 'login_org_suspended', JSON.stringify({ email: userRow.email || userRow.username })]
        );
      } catch (_) {}
      return res.status(403).json({ ok: false, message: 'Organization is suspended' });
    }

    const roleId = userRow.role_id || userRow.role;
    let roleName = roleId;
    try {
      if (roleId && typeof roleId === 'string') {
        const roleRow = await db.get('SELECT name FROM roles WHERE id = $1', [roleId]);
        if (roleRow) roleName = roleRow.name;
        else roleName = deriveRoleName(roleId);
      }
    } catch (_) {
      if (roleId && typeof roleId === 'string') roleName = deriveRoleName(roleId);
    }
    // v6: resolve granular permissions + org branding for this user
    const permissions = await getPermissionsForUser({ role_id: roleId, role: roleName });
    const orgBranding = userRow.org_id ? await getOrgBranding(userRow.org_id) : null;
    const payload = {
      sub: userRow.id,
      role: roleName,
      role_id: roleId || null,
      org_id: userRow.org_id || null,
      email: userRow.email || userRow.username,
      permissions,
    };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    try {
      db.run(
        'INSERT INTO audit_log (user_id, org_id, module, action, payload) VALUES ($1, $2, $3, $4, $5)',
        [userRow.id, userRow.org_id || null, 'auth', 'login_success', JSON.stringify({ email: userRow.email || userRow.username })]
      );
    } catch (_) {}

    let enabled_modules = null;
    let enabled_addons = null;
    if (userRow.org_id) {
      try {
        const modRows = await db.query('SELECT module_name FROM org_modules WHERE org_id = $1 AND enabled = 1', [userRow.org_id]);
        const addonRows = await db.query('SELECT addon_name FROM org_addons WHERE org_id = $1 AND enabled = 1', [userRow.org_id]);
        enabled_modules = modRows.map((r) => r.module_name);
        enabled_addons = addonRows.map((r) => r.addon_name);
      } catch (_) {
        enabled_modules = [];
        enabled_addons = [];
      }
    }

    res.json({
      ok: true,
      token,
      user: {
        id: userRow.id,
        role: roleName,
        role_id: roleId || null,
        org_id: userRow.org_id,
        email: userRow.email || userRow.username,
        username: userRow.username || userRow.email,
        full_name: userRow.full_name || userRow.username || userRow.email,
        permissions,
        enabled_modules,
        enabled_addons,
        org_logo: orgBranding?.logo || null,
        org_name: orgBranding?.name || null,
        parent_org_id: orgBranding?.parent_org_id || null,
        parent_name: orgBranding?.parent_name || null,
        org_kind: orgBranding?.kind || null,
        org_address: orgBranding?.address || null,
        org_phone: orgBranding?.phone || null,
        org_email: orgBranding?.email || null,
        org_website_slug: orgBranding?.website_slug || null,
        org_country: orgBranding?.country || null,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/** GET /api/uhpcms/auth/me — current user profile (JWT) */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const id = req.user.sub;
    const row = await db.get(
      `SELECT u.id, u.org_id, u.email, u.full_name, u.role_id, u.department_id, u.status, u.created_at,
        r.name AS role_name, d.name AS department_name, o.name AS org_name
       FROM system_users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN organizations o ON o.id = u.org_id
       WHERE u.id = $1`,
      [id]
    );
    if (row) {
      let enabled_modules = [];
      let enabled_addons = [];
      if (row.org_id) {
        try {
          const modRows = await db.query('SELECT module_name FROM org_modules WHERE org_id = $1 AND enabled = 1', [row.org_id]);
          const addonRows = await db.query('SELECT addon_name FROM org_addons WHERE org_id = $1 AND enabled = 1', [row.org_id]);
          enabled_modules = (modRows || []).map((r) => r.module_name);
          enabled_addons = (addonRows || []).map((r) => r.addon_name);
        } catch (_) {
          enabled_modules = [];
          enabled_addons = [];
        }
      }
      const roleName = row.role_name || deriveRoleName(row.role_id);
      const permissions = await getPermissionsForUser({ role_id: row.role_id, role: roleName });
      const orgBranding = row.org_id ? await getOrgBranding(row.org_id) : null;
      return res.json({
        ok: true,
        user: {
          id: row.id,
          org_id: row.org_id,
          email: row.email,
          full_name: row.full_name,
          role_id: row.role_id,
          role: roleName,
          permissions,
          department_id: row.department_id,
          department_name: row.department_name || null,
          org_name: row.org_name || orgBranding?.name || null,
          org_logo: orgBranding?.logo || null,
          parent_org_id: orgBranding?.parent_org_id || null,
          parent_name: orgBranding?.parent_name || null,
          org_kind: orgBranding?.kind || null,
          org_address: orgBranding?.address || null,
          org_phone: orgBranding?.phone || null,
          org_email: orgBranding?.email || null,
          org_website_slug: orgBranding?.website_slug || null,
          org_country: orgBranding?.country || null,
          status: row.status,
          created_at: row.created_at,
          enabled_modules,
          enabled_addons,
        },
      });
    }
    return res.json({
      ok: true,
      user: {
        id: req.user.sub,
        role: req.user.role,
        email: req.user.email,
        username: req.user.email,
        full_name: req.user.email,
        org_id: req.user.org_id || null,
        legacy: true,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
