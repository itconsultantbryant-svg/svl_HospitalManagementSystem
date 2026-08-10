const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getPermissionsForRole, getAllPermissionIds } = require('../lib/permissions');
const bcrypt = require('bcryptjs');
const ids = require('../lib/ids');

const router = express.Router();

const MODULES = ['hospital', 'clinic', 'pharmacy', 'lab', 'billing', 'pharmacy_inventory', 'hr', 'reporting'];
const ORG_TYPES = ['hospital', 'clinic', 'pharmacy'];
const ADDON_CATALOG = [
  { name: 'telemedicine', label: 'Telemedicine', description: 'Remote consultations and video visits' },
  { name: 'ehr', label: 'Electronic Health Records', description: 'Advanced patient record management' },
  { name: 'sms_alerts', label: 'SMS Alerts', description: 'Text notifications for appointments & results' },
  { name: 'payments', label: 'Mobile Payments', description: 'MTN/Orange Money and card payments' },
  { name: 'analytics', label: 'Analytics', description: 'Advanced reporting and insights' },
  { name: 'inventory', label: 'Pharmacy Inventory', description: 'Stock control and expiry tracking' },
];

const isSuper = (req) => req.user && req.user.role === 'super_admin';

/** Whether the caller may manage the given org (super admin, or the org's own admin). */
async function canManageOrg(req, orgId) {
  if (isSuper(req)) return true;
  if (!req.user?.org_id) return false;
  if (req.user.org_id === orgId) return true;
  // org admin may manage its direct child (branch/clinic) orgs
  const child = await db.get('SELECT parent_org_id FROM organizations WHERE id = $1', [orgId]);
  return child?.parent_org_id === req.user.org_id;
}

/** Organization listing fields including branding + parent context. */
const ORG_COLS = `o.id, o.name, o.type, o.kind, o.status, o.subscription_plan, o.created_at,
  o.parent_org_id, o.logo_base64, o.signature_base64, o.address, o.phone, o.email, o.country,
  o.website_slug, o.created_by, p.name AS parent_name`;

function orgListQuery(base, params) {
  return db.query(
    `SELECT ${ORG_COLS} FROM organizations o LEFT JOIN organizations p ON p.id = o.parent_org_id ${base}`,
    params
  );
}

/** Create the standard role set for an org (org_admin + clinical/admin roles). */
async function createDefaultOrgRoles(orgId, kind) {
  const roleSet = [
    ['role_org_admin_' + orgId, 'org_admin', orgId, 1],
    ['role_doctor_' + orgId, 'doctor', orgId, 1],
    ['role_nurse_' + orgId, 'nurse', orgId, 1],
    ['role_receptionist_' + orgId, 'receptionist', orgId, 1],
    ['role_pharmacist_' + orgId, 'pharmacist', orgId, 1],
    ['role_accountant_' + orgId, 'accountant', orgId, 1],
    ['role_representative_' + orgId, 'representative', orgId, 1],
    ['role_department_head_' + orgId, 'department_head', orgId, 0],
    ['role_branch_head_' + orgId, 'branch_head', orgId, kind === 'branch' || kind === 'clinic' ? 1 : 0],
  ];
  for (const [rid, name, oid, isSystem] of roleSet) {
    await db.run(
      'INSERT INTO roles (id, name, org_id, is_system) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
      [rid, name, oid, isSystem]
    );
  }
}

/** Create an admin user for an org with the org_admin role. */
async function createOrgAdminUser(orgId, { admin_email, admin_password, admin_name }) {
  if (!admin_email || !admin_password) return null;
  const email = String(admin_email).trim().toLowerCase();
  const pass = String(admin_password);
  if (pass.length < 6) throw new Error('admin_password must be at least 6 characters');
  const existing = await db.get(
    'SELECT id FROM system_users WHERE LOWER(TRIM(email)) = $1',
    [email]
  );
  if (existing) throw new Error('An account with that email already exists');
  const userId = await ids.getNextUserId();
  const hash = await bcrypt.hash(pass, 10);
  await db.run(
    `INSERT INTO system_users (id, org_id, email, username, password_hash, role_id, full_name, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${db.NOW})`,
    [userId, orgId, email, email, hash, 'role_org_admin_' + orgId, admin_name || null, 'active']
  );
  return userId;
}

// All governance routes require auth
router.use(requireAuth);

// GET /api/uhpcms/governance/organizations - list orgs (super admin: all; org admin: own + children)
router.get('/organizations', async (req, res) => {
  try {
    const rows = isSuper(req)
      ? await orgListQuery('ORDER BY o.created_at DESC', [])
      : await orgListQuery('WHERE o.id = $1 OR o.parent_org_id = $2 ORDER BY o.created_at DESC', [req.user.org_id, req.user.org_id]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/governance/organizations - create organization (super_admin)
router.post('/organizations', async (req, res) => {
  if (!isSuper(req)) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
  try {
    const {
      name, type, subscription_plan, parent_org_id, kind,
      logo_base64, signature_base64, address, phone, email, country, website_slug,
      admin_email, admin_password, admin_name,
    } = req.body || {};
    if (!name || !type) return res.status(400).json({ ok: false, message: 'name and type required' });
    if (!ORG_TYPES.includes(type)) {
      return res.status(400).json({ ok: false, message: 'type must be hospital, clinic, or pharmacy' });
    }
    if (parent_org_id) {
      const parent = await db.get('SELECT id FROM organizations WHERE id = $1', [parent_org_id]);
      if (!parent) return res.status(400).json({ ok: false, message: 'Parent organization not found' });
    }
    const id = await ids.getNextOrganizationId();
    const orgKind = kind || (parent_org_id ? 'branch' : 'hospital');
    await db.run(
      `INSERT INTO organizations (id, name, type, kind, status, subscription_plan, parent_org_id,
         logo_base64, signature_base64, address, phone, email, country, website_slug, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, ${db.NOW})`,
      [id, name, type, orgKind, 'active', subscription_plan || 'standard', parent_org_id || null,
        logo_base64 || null, signature_base64 || null, address || null, phone || null, email || null, country || 'Liberia', website_slug || null, req.user.sub || null]
    );
    await createDefaultOrgRoles(id, orgKind);

    // modules: if this is a branch/clinic, inherit parent modules; else enable based on type
    let modules = MODULES.map((m) => ({ name: m, enabled: m === type || m === 'billing' ? 1 : 0 }));
    if (parent_org_id) {
      const parentMods = await db.query('SELECT module_name, enabled FROM org_modules WHERE org_id = $1', [parent_org_id]);
      if (parentMods.length) modules = parentMods.map((m) => ({ name: m.module_name, enabled: m.enabled }));
    }
    for (const m of modules) {
      await db.run(
        'INSERT INTO org_modules (org_id, module_name, enabled) VALUES ($1, $2, $3) ON CONFLICT (org_id, module_name) DO NOTHING',
        [id, m.name, m.enabled ? 1 : 0]
      );
    }

    let adminUserId = null;
    try {
      adminUserId = await createOrgAdminUser(id, { admin_email, admin_password, admin_name });
    } catch (e) {
      // Don't roll back the org if admin creation fails; surface the message
      return res.status(400).json({ ok: false, message: e.message, id });
    }

    res.status(201).json({ ok: true, id, name, type, kind: orgKind, parent_org_id: parent_org_id || null, admin_user_id: adminUserId });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PATCH /api/uhpcms/governance/organizations/:id - update branding/status (super_admin or org admin)
router.patch('/organizations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await canManageOrg(req, id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const {
      name, type, status, subscription_plan, kind,
      logo_base64, signature_base64, address, phone, email, country, website_slug,
    } = req.body || {};
    const existing = await db.get('SELECT id FROM organizations WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'Organization not found' });

    const sets = [];
    const params = [];
    const push = (col, val) => { if (val !== undefined && val !== null) { sets.push(`${col} = $${params.length + 1}`); params.push(val); } };
    push('name', name);
    if (type != null && ORG_TYPES.includes(type)) push('type', type);
    if (status != null && ['active', 'suspended', 'inactive'].includes(status)) push('status', status);
    push('subscription_plan', subscription_plan);
    if (kind != null && ['hospital', 'branch', 'clinic'].includes(kind)) push('kind', kind);
    push('logo_base64', logo_base64);
    push('signature_base64', signature_base64);
    push('address', address);
    push('phone', phone);
    push('email', email);
    push('country', country);
    push('website_slug', website_slug);
    if (sets.length) {
      params.push(id);
      await db.run(`UPDATE organizations SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/organizations/:id - single organization (super admin or own org)
router.get('/organizations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await canManageOrg(req, id))) {
      return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    }
    const rows = await orgListQuery('WHERE o.id = $1', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ ok: false, message: 'Organization not found' });
    const branches = await db.query(
      `SELECT id, name, type, kind, status FROM organizations WHERE parent_org_id = $1 AND status != 'inactive' ORDER BY name`,
      [id]
    );
    row.branches = branches;
    res.json({ ok: true, data: row });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PUT /api/uhpcms/governance/organizations/:id - full update (super_admin only)
router.put('/organizations/:id', async (req, res) => {
  if (!isSuper(req)) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
  try {
    const { id } = req.params;
    const {
      name, type, subscription_plan, status, kind,
      logo_base64, signature_base64, address, phone, email, country, website_slug,
    } = req.body || {};
    const existing = await db.get('SELECT id FROM organizations WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'Organization not found' });
    const sets = [];
    const params = [];
    const push = (col, val) => { if (val !== undefined && val !== null) { sets.push(`${col} = $${params.length + 1}`); params.push(val); } };
    push('name', name);
    if (type != null && ORG_TYPES.includes(type)) push('type', type);
    push('subscription_plan', subscription_plan);
    if (status != null && ['active', 'suspended', 'inactive'].includes(status)) push('status', status);
    if (kind != null && ['hospital', 'branch', 'clinic'].includes(kind)) push('kind', kind);
    push('logo_base64', logo_base64);
    push('signature_base64', signature_base64);
    push('address', address);
    push('phone', phone);
    push('email', email);
    push('country', country);
    push('website_slug', website_slug);
    if (sets.length) {
      params.push(id);
      await db.run(`UPDATE organizations SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// DELETE /api/uhpcms/governance/organizations/:id (super_admin only)
router.delete('/organizations/:id', async (req, res) => {
  if (!isSuper(req)) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
  try {
    const { id } = req.params;
    const existing = await db.get('SELECT id FROM organizations WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'Organization not found' });
    const childCount = await db.get('SELECT COUNT(*) as c FROM organizations WHERE parent_org_id = $1', [id]);
    if (childCount?.c > 0) {
      return res.status(400).json({ ok: false, message: 'Cannot delete organization with branches/clinics. Deactivate or delete them first.' });
    }
    const userCount = await db.get('SELECT COUNT(*) as c FROM system_users WHERE org_id = $1', [id]);
    if (userCount?.c > 0) {
      return res.status(400).json({ ok: false, message: 'Cannot delete organization with users. Remove or reassign users first.' });
    }
    await db.run('DELETE FROM org_addons WHERE org_id = $1', [id]);
    await db.run('DELETE FROM org_modules WHERE org_id = $1', [id]);
    await db.run('DELETE FROM roles WHERE org_id = $1', [id]);
    await db.run('DELETE FROM organizations WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Branch / clinic management (child orgs) ----------

// POST /api/uhpcms/governance/organizations/:id/branches - create branch/clinic under an org
router.post('/organizations/:id/branches', async (req, res) => {
  try {
    const parentId = req.params.id;
    if (!(await canManageOrg(req, parentId))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const parent = await db.get('SELECT id, type FROM organizations WHERE id = $1', [parentId]);
    if (!parent) return res.status(404).json({ ok: false, message: 'Parent organization not found' });
    const {
      name, type = 'clinic', admin_email, admin_password, admin_name,
      logo_base64, signature_base64, address, phone, email, country, website_slug,
    } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, message: 'name required' });
    if (!['branch', 'clinic'].includes(type)) {
      return res.status(400).json({ ok: false, message: 'branch type must be branch or clinic' });
    }
    const id = await ids.getNextOrganizationId();
    await db.run(
      `INSERT INTO organizations (id, name, type, kind, status, subscription_plan, parent_org_id,
         logo_base64, signature_base64, address, phone, email, country, website_slug, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, ${db.NOW})`,
      [id, name, type === 'branch' ? 'hospital' : 'clinic', type, 'active', parent.subscription_plan || 'standard', parentId,
        logo_base64 || null, signature_base64 || null, address || null, phone || null, email || null, country || 'Liberia', website_slug || null, req.user.sub || null]
    );
    await createDefaultOrgRoles(id, type);

    // inherit parent's module settings
    const parentMods = await db.query('SELECT module_name, enabled FROM org_modules WHERE org_id = $1', [parentId]);
    for (const m of parentMods) {
      await db.run(
        'INSERT INTO org_modules (org_id, module_name, enabled) VALUES ($1, $2, $3) ON CONFLICT (org_id, module_name) DO NOTHING',
        [id, m.module_name, m.enabled]
      );
    }

    let adminUserId = null;
    if (admin_email && admin_password) {
      adminUserId = await createOrgAdminUser(id, { admin_email, admin_password, admin_name });
    }
    res.status(201).json({ ok: true, id, name, kind: type, parent_org_id: parentId, admin_user_id: adminUserId });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/organizations/:id/branches - list children of an org
router.get('/organizations/:id/branches', async (req, res) => {
  try {
    const parentId = req.params.id;
    if (!(await canManageOrg(req, parentId))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const rows = await orgListQuery('WHERE o.parent_org_id = $1 ORDER BY o.name', [parentId]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PATCH /api/uhpcms/governance/branches/:id - update branch/clinic (super admin or parent org admin)
router.patch('/branches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await canManageOrg(req, id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const {
      name, status, logo_base64, signature_base64, address, phone, email, country, website_slug, branch_head_user_id,
    } = req.body || {};
    const existing = await db.get('SELECT id FROM organizations WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'Branch not found' });
    const sets = [];
    const params = [];
    const push = (col, val) => { if (val !== undefined && val !== null) { sets.push(`${col} = $${params.length + 1}`); params.push(val); } };
    push('name', name);
    if (status != null && ['active', 'inactive', 'suspended'].includes(status)) push('status', status);
    push('logo_base64', logo_base64);
    push('signature_base64', signature_base64);
    push('address', address);
    push('phone', phone);
    push('email', email);
    push('country', country);
    push('website_slug', website_slug);
    if (sets.length) {
      params.push(id);
      await db.run(`UPDATE organizations SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// DELETE /api/uhpcms/governance/branches/:id - deactivate branch/clinic
router.delete('/branches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await canManageOrg(req, id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const userCount = await db.get('SELECT COUNT(*) as c FROM system_users WHERE org_id = $1', [id]);
    if (userCount?.c > 0) {
      return res.status(400).json({ ok: false, message: 'Cannot deactivate branch with users. Remove or reassign users first.' });
    }
    await db.run('UPDATE organizations SET status = $1 WHERE id = $2', ['inactive', id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Module / add-on management ----------

// GET /api/uhpcms/governance/organizations/:id/modules
router.get('/organizations/:id/modules', async (req, res) => {
  try {
    const rows = await db.query('SELECT module_name, enabled FROM org_modules WHERE org_id = $1', [req.params.id]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    if (e.code === '42P01' || e.message?.includes('does not exist') || e.message?.includes('no such table')) {
      return res.json({ ok: true, data: [] });
    }
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PUT /api/uhpcms/governance/organizations/:id/modules - enable/disable modules (super_admin)
router.put('/organizations/:id/modules', async (req, res) => {
  if (!isSuper(req)) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
  try {
    const { id } = req.params;
    const { modules } = req.body || {};
    if (!Array.isArray(modules)) return res.status(400).json({ ok: false, message: 'modules array required' });
    for (const { name, enabled } of modules) {
      await db.run(
        'INSERT INTO org_modules (org_id, module_name, enabled) VALUES ($1, $2, $3) ON CONFLICT(org_id, module_name) DO UPDATE SET enabled = $3',
        [id, name, enabled ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/organizations/:id/addons
router.get('/organizations/:id/addons', async (req, res) => {
  try {
    const rows = await db.query('SELECT addon_name, enabled FROM org_addons WHERE org_id = $1', [req.params.id]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    if (e.code === '42P01' || e.message?.includes('does not exist') || e.message?.includes('no such table')) {
      return res.json({ ok: true, data: [] });
    }
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PUT /api/uhpcms/governance/organizations/:id/addons - enable/disable add-ons (super_admin)
router.put('/organizations/:id/addons', async (req, res) => {
  if (!isSuper(req)) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
  try {
    const { id } = req.params;
    const { addons } = req.body || {};
    if (!Array.isArray(addons)) return res.status(400).json({ ok: false, message: 'addons array required' });
    for (const { name, enabled } of addons) {
      await db.run(
        'INSERT INTO org_addons (org_id, addon_name, enabled) VALUES ($1, $2, $3) ON CONFLICT(org_id, addon_name) DO UPDATE SET enabled = $3',
        [id, name, enabled ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/addon-catalog - list available add-ons
router.get('/addon-catalog', async (req, res) => {
  try {
    const rows = await db.query('SELECT name, label, description FROM addon_catalog ORDER BY name');
    if (rows.length) return res.json({ ok: true, data: rows });
  } catch (_) {}
  res.json({ ok: true, data: ADDON_CATALOG });
});

// ---------- Role & permission management ----------

// GET /api/uhpcms/governance/organizations/:id/roles - list roles for an org
router.get('/organizations/:id/roles', async (req, res) => {
  try {
    const orgId = req.params.id;
    if (!(await canManageOrg(req, orgId))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const rows = await db.query(
      `SELECT r.id, r.name, r.description, r.is_system, r.org_id,
              (SELECT COUNT(*) FROM system_users u WHERE u.role_id = r.id) AS user_count
       FROM roles r WHERE r.org_id = $1 ORDER BY r.is_system DESC, r.name`,
      [orgId]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/governance/organizations/:id/roles - create custom role (super_admin or org admin)
router.post('/organizations/:id/roles', async (req, res) => {
  try {
    const orgId = req.params.id;
    if (!(await canManageOrg(req, orgId))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const { name, description, permission_ids } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, message: 'name required' });
    const dup = await db.get('SELECT id FROM roles WHERE org_id = $1 AND LOWER(name) = LOWER($2)', [orgId, name]);
    if (dup) return res.status(400).json({ ok: false, message: 'A role with that name already exists' });
    const roleId = 'role_custom_' + orgId + '_' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    await db.run(
      'INSERT INTO roles (id, name, description, org_id, is_system) VALUES ($1, $2, $3, $4, 0) ON CONFLICT (id) DO NOTHING',
      [roleId, name, description || null, orgId]
    );
    if (Array.isArray(permission_ids) && permission_ids.length) {
      for (const pid of permission_ids) {
        await db.run(
          'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [roleId, pid]
        );
      }
    }
    res.status(201).json({ ok: true, id: roleId, name, org_id: orgId });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/roles/:id/permissions - list permission ids for a role
router.get('/roles/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const role = await db.get('SELECT org_id FROM roles WHERE id = $1', [id]);
    if (!role) return res.status(404).json({ ok: false, message: 'Role not found' });
    if (!(await canManageOrg(req, role.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const perms = await getPermissionsForRole(id);
    res.json({ ok: true, data: perms });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PUT /api/uhpcms/governance/roles/:id/permissions - set permissions for a role (replace all)
router.put('/roles/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const role = await db.get('SELECT org_id FROM roles WHERE id = $1', [id]);
    if (!role) return res.status(404).json({ ok: false, message: 'Role not found' });
    if (!(await canManageOrg(req, role.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const { permission_ids } = req.body || {};
    if (!Array.isArray(permission_ids)) return res.status(400).json({ ok: false, message: 'permission_ids array required' });
    await db.run('DELETE FROM role_permissions WHERE role_id = $1', [id]);
    for (const pid of permission_ids) {
      await db.run(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, pid]
      );
    }
    res.json({ ok: true, count: permission_ids.length });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/permissions - full permission catalog, grouped by module
router.get('/permissions', async (req, res) => {
  try {
    const rows = await db.query('SELECT id, module, action, description FROM permissions ORDER BY module, action');
    const grouped = {};
    for (const r of rows) {
      (grouped[r.module] = grouped[r.module] || []).push(r);
    }
    res.json({ ok: true, data: rows, grouped });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Governance users ----------

// GET /api/uhpcms/governance/users - list users (super admin: all; org admin: own org + children)
router.get('/users', async (req, res) => {
  try {
    const orgId = req.query.org_id && String(req.query.org_id).trim() ? req.query.org_id.trim() : null;
    const includeChildren = req.query.include_children === '1' || req.query.include_children === 'true';
    let rows;
    if (isSuper(req)) {
      if (orgId && includeChildren) {
        rows = await db.query(
          `SELECT u.id, u.org_id, u.email, u.role_id, u.full_name, u.status, u.created_at,
                  r.name AS role_name, o.name AS org_name
           FROM system_users u
           LEFT JOIN roles r ON r.id = u.role_id
           LEFT JOIN organizations o ON o.id = u.org_id
           WHERE u.org_id = $1 OR u.org_id IN (SELECT id FROM organizations WHERE parent_org_id = $2)
           ORDER BY u.email`, [orgId, orgId]);
      } else if (orgId) {
        rows = await db.query(
          `SELECT u.id, u.org_id, u.email, u.role_id, u.full_name, u.status, u.created_at,
                  r.name AS role_name, o.name AS org_name
           FROM system_users u
           LEFT JOIN roles r ON r.id = u.role_id
           LEFT JOIN organizations o ON o.id = u.org_id
           WHERE u.org_id = $1 ORDER BY u.email`, [orgId]);
      } else {
        rows = await db.query(
          `SELECT u.id, u.org_id, u.email, u.role_id, u.full_name, u.status, u.created_at,
                  r.name AS role_name, o.name AS org_name
           FROM system_users u
           LEFT JOIN roles r ON r.id = u.role_id
           LEFT JOIN organizations o ON o.id = u.org_id
           ORDER BY u.org_id, u.email`);
      }
    } else if (req.user.org_id) {
      const own = req.user.org_id;
      rows = await db.query(
        `SELECT u.id, u.org_id, u.email, u.role_id, u.full_name, u.status, u.created_at,
                r.name AS role_name, o.name AS org_name
         FROM system_users u
         LEFT JOIN roles r ON r.id = u.role_id
         LEFT JOIN organizations o ON o.id = u.org_id
         WHERE u.org_id = $1 OR u.org_id IN (SELECT id FROM organizations WHERE parent_org_id = $2)
         ORDER BY u.email`, [own, own]);
    } else {
      rows = [];
    }
    res.json({ ok: true, data: rows });
  } catch (e) {
    if (e.code === '42P01' || e.message?.includes('does not exist') || e.message?.includes('no such table')) {
      return res.json({ ok: true, data: [] });
    }
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/orgs/:id/users - list users for org + descendants
router.get('/orgs/:id/users', async (req, res) => {
  try {
    const orgId = req.params.id;
    if (!(await canManageOrg(req, orgId))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const rows = await db.query(
      `SELECT u.id, u.org_id, u.email, u.role_id, u.full_name, u.status, u.created_at,
              r.name AS role_name, o.name AS org_name, o.kind AS org_kind
       FROM system_users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN organizations o ON o.id = u.org_id
       WHERE u.org_id = $1 OR u.org_id IN (SELECT id FROM organizations WHERE parent_org_id = $2)
       ORDER BY u.org_id, u.email`, [orgId, orgId]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/governance/users - create a user (super_admin or org admin for their org)
router.post('/users', async (req, res) => {
  try {
    const { org_id, email, password, role_id, full_name, department_id } = req.body || {};
    if (!org_id || !email || !password) return res.status(400).json({ ok: false, message: 'org_id, email, password required' });
    if (!(await canManageOrg(req, org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    if (String(password).length < 6) return res.status(400).json({ ok: false, message: 'password must be at least 6 characters' });
    const roleRow = await db.get('SELECT id, name FROM roles WHERE id = $1 AND org_id = $2', [role_id, org_id]);
    if (role_id && !roleRow) return res.status(400).json({ ok: false, message: 'Role does not belong to this organization' });

    const cleanEmail = String(email).trim().toLowerCase();
    const dup = await db.get('SELECT id FROM system_users WHERE LOWER(TRIM(email)) = $1', [cleanEmail]);
    if (dup) return res.status(400).json({ ok: false, message: 'An account with that email already exists' });

    const userId = await ids.getNextUserId();
    const hash = await bcrypt.hash(String(password), 10);
    await db.run(
      `INSERT INTO system_users (id, org_id, email, username, password_hash, role_id, full_name, department_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${db.NOW})`,
      [userId, org_id, cleanEmail, cleanEmail, hash, role_id || null, full_name || null, department_id || null, 'active']
    );
    res.status(201).json({ ok: true, id: userId, org_id, role_id: role_id || null });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/users/:id
router.get('/users/:id', async (req, res) => {
  try {
    const row = await db.get(
      `SELECT u.id, u.org_id, u.email, u.role_id, u.department_id, u.full_name, u.status, u.created_at,
              r.name AS role_name, o.name AS org_name
       FROM system_users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN organizations o ON o.id = u.org_id
       WHERE u.id = $1`, [req.params.id]);
    if (!row) return res.status(404).json({ ok: false, message: 'User not found' });
    if (!(await canManageOrg(req, row.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    res.json({ ok: true, data: row });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PATCH /api/uhpcms/governance/users/:id
router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, full_name, role_id, status, password, department_id } = req.body || {};
    const existing = await db.get('SELECT id, org_id FROM system_users WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'User not found' });
    if (!(await canManageOrg(req, existing.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });

    const sets = [];
    const params = [];
    const push = (col, val) => { if (val !== undefined && val !== null) { sets.push(`${col} = $${params.length + 1}`); params.push(val); } };
    if (email != null) push('email', String(email).trim().toLowerCase());
    if (full_name != null) push('full_name', full_name || null);
    if (role_id != null) {
      const roleRow = await db.get('SELECT id FROM roles WHERE id = $1 AND org_id = $2', [role_id, existing.org_id]);
      if (!roleRow) return res.status(400).json({ ok: false, message: 'Role does not belong to this organization' });
      push('role_id', role_id);
    }
    if (department_id !== undefined) push('department_id', department_id || null);
    if (status != null && ['active', 'inactive', 'suspended'].includes(status)) push('status', status);
    if (password != null && String(password).length >= 6) {
      const hash = await bcrypt.hash(String(password), 10);
      sets.push(`password_hash = $${params.length + 1}`);
      params.push(hash);
    }
    if (sets.length) {
      params.push(id);
      await db.run(`UPDATE system_users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// DELETE /api/uhpcms/governance/users/:id (deactivate; super admin or org admin for own org)
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.sub || req.user?.id;
    if (currentUserId && id === currentUserId) {
      return res.status(400).json({ ok: false, message: 'You cannot delete your own account.' });
    }
    const existing = await db.get('SELECT id, org_id FROM system_users WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'User not found' });
    if (!(await canManageOrg(req, existing.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    await db.run('UPDATE system_users SET status = $1 WHERE id = $2', ['inactive', id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Cross-org monitoring ----------

// GET /api/uhpcms/governance/monitor - aggregated platform stats
router.get('/monitor', async (req, res) => {
  try {
    const agg = (query) => {
      try { const r = db.get(query); return r?.c || r?.v || 0; } catch (_) { return 0; }
    };
    const totalOrgs = agg('SELECT COUNT(*) AS c FROM organizations');
    const activeOrgs = agg("SELECT COUNT(*) AS c FROM organizations WHERE status = 'active'");
    const totalUsers = agg('SELECT COUNT(*) AS c FROM system_users');
    const activeUsers = agg("SELECT COUNT(*) AS c FROM system_users WHERE status = 'active'");
    const totalEncounters = agg('SELECT COUNT(*) AS c FROM encounters');
    const totalPatients = agg('SELECT COUNT(*) AS c FROM patient_org');
    const totalInvoices = agg('SELECT COUNT(*) AS c FROM invoices');
    let totalRevenue = 0;
    try {
      const rev = db.get('SELECT COALESCE(SUM(amount),0) AS v FROM payments');
      totalRevenue = Number(rev?.v || 0);
    } catch (_) {
      try {
        const rev = db.get('SELECT COALESCE(SUM(amount),0) AS v FROM payments');
        totalRevenue = Number(rev?.v || 0);
      } catch (_2) {}
    }
    let orgsByType = [];
    try { orgsByType = await db.query('SELECT type, COUNT(*) AS count FROM organizations GROUP BY type'); } catch (_) {}
    let recentActivity = [];
    try {
      recentActivity = await db.query(
        `SELECT a.id, a.org_id, a.user_id, a.module, a.action, a.payload, a.created_at,
                o.name AS org_name, u.email AS user_email
         FROM audit_log a
         LEFT JOIN organizations o ON o.id = a.org_id
         LEFT JOIN system_users u ON u.id = a.user_id
         ORDER BY a.created_at DESC LIMIT 20`
      );
    } catch (_) {}
    res.json({
      ok: true,
      data: {
        total_orgs: totalOrgs,
        active_orgs: activeOrgs,
        suspended_orgs: Math.max(0, totalOrgs - activeOrgs),
        total_users: totalUsers,
        active_users: activeUsers,
        total_encounters: totalEncounters,
        total_patients: totalPatients,
        total_invoices: totalInvoices,
        total_revenue: totalRevenue,
        orgs_by_type: orgsByType,
        recent_activity: recentActivity,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/audit - audit log (filters: org_id, module, user_id, date_from, date_to, limit)
router.get('/audit', async (req, res) => {
  try {
    const { org_id, module, user_id, date_from, date_to, limit } = req.query;
    if (!isSuper(req) && !req.user?.org_id) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const where = [];
    const params = [];
    if (!isSuper(req) && req.user?.org_id) {
      where.push('(a.org_id = $' + (params.length + 1) + ' OR a.org_id IN (SELECT id FROM organizations WHERE parent_org_id = $' + (params.length + 1) + '))');
      params.push(req.user.org_id);
    } else if (org_id) {
      where.push('a.org_id = $' + (params.length + 1));
      params.push(org_id);
    }
    if (module) { where.push('a.module = $' + (params.length + 1)); params.push(module); }
    if (user_id) { where.push('a.user_id = $' + (params.length + 1)); params.push(user_id); }
    if (date_from) { where.push('a.created_at >= $' + (params.length + 1)); params.push(date_from); }
    if (date_to) { where.push('a.created_at <= $' + (params.length + 1)); params.push(date_to); }
    const lim = Math.min(parseInt(limit, 10) || 100, 500);
    const rows = await db.query(
      `SELECT a.id, a.org_id, a.user_id, a.module, a.action, a.payload, a.created_at,
              o.name AS org_name, u.email AS user_email
       FROM audit_log a
       LEFT JOIN organizations o ON o.id = a.org_id
       LEFT JOIN system_users u ON u.id = a.user_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.created_at DESC LIMIT ${lim}`,
      params
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/governance/report - per-org summary report
router.get('/report', async (req, res) => {
  try {
    const orgs = await db.query('SELECT id, name, kind, type, status, subscription_plan, created_at FROM organizations ORDER BY created_at DESC');
    const out = [];
    const count = (q, p) => { try { return db.get(q, p)?.c || 0; } catch (_) { return 0; } };
    const countQ = (q, p) => { try { return db.query(q, p)[0]?.c || 0; } catch (_) { return 0; } };
    for (const o of orgs) {
      const row = { ...o };
      row.user_count = count('SELECT COUNT(*) AS c FROM system_users WHERE org_id = $1', [o.id]);
      row.active_user_count = count("SELECT COUNT(*) AS c FROM system_users WHERE org_id = $1 AND status='active'", [o.id]);
      row.encounter_count = count('SELECT COUNT(*) AS c FROM encounters WHERE org_id = $1', [o.id]);
      row.patient_count = count('SELECT COUNT(*) AS c FROM patient_org WHERE org_id = $1', [o.id]);
      row.module_count = countQ('SELECT COUNT(*) AS c FROM org_modules WHERE org_id = $1 AND enabled = 1', [o.id]);
      out.push(row);
    }
    res.json({ ok: true, data: out });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
