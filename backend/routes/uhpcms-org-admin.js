const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { audit } = require('../middleware/audit');
const { requireOrgActive } = require('../middleware/orgCheck');
const { requireOrgContext } = require('../middleware/requireOrgContext');
const { getPermissionsForRole } = require('../lib/permissions');
const ids = require('../lib/ids');

const router = express.Router();
router.use(requireAuth);
router.use(requireOrgActive);

const isSuper = (req) => req.user && req.user.role === 'super_admin';

/** Whether caller may operate on orgId (super admin: any; org admin: own or direct child). */
async function canAccessOrg(req, orgId) {
  if (isSuper(req)) return true;
  if (!req.user?.org_id) return false;
  if (orgId === req.user.org_id) return true;
  const child = await db.get('SELECT parent_org_id FROM organizations WHERE id = $1', [orgId]);
  return child?.parent_org_id === req.user.org_id;
}

// ---------- Roles (for user creation dropdown) ----------
const DEFAULT_ORG_ROLES = [
  ['org_admin', (id) => `role_org_admin_${id}`],
  ['doctor', (id) => `role_doctor_${id}`],
  ['nurse', (id) => `role_nurse_${id}`],
  ['accountant', (id) => `role_accountant_${id}`],
  ['receptionist', (id) => `role_receptionist_${id}`],
  ['pharmacist', (id) => `role_pharmacist_${id}`],
  ['representative', (id) => `role_representative_${id}`],
];

router.get('/roles', requireOrgContext, async (req, res) => {
  try {
    const orgId = req.orgId;
    const normalizedOrgId = orgId && String(orgId).trim() ? orgId : null;
    if (normalizedOrgId) {
      for (const [name, idFn] of DEFAULT_ORG_ROLES) {
        const roleId = idFn(normalizedOrgId);
        const exists = await db.get('SELECT id FROM roles WHERE id = $1', [roleId]);
        if (!exists) {
          await db.run('INSERT INTO roles (id, name, org_id, is_system) VALUES ($1, $2, $3, 1)', [roleId, name, normalizedOrgId]);
        }
      }
    }
    const sql = normalizedOrgId
      ? 'SELECT id, name, description, is_system FROM roles WHERE org_id = $1 ORDER BY is_system DESC, name'
      : 'SELECT id, name, description, is_system FROM roles WHERE org_id IS NULL ORDER BY name';
    const params = normalizedOrgId ? [normalizedOrgId] : [];
    const rows = await db.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/org-admin/roles - create a custom role with permissions
router.post('/roles', requireOrgContext, audit('org_admin', 'create_role'), async (req, res) => {
  try {
    const orgId = req.orgId;
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
    res.status(201).json({ ok: true, id: roleId, name });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/org-admin/roles/:id/permissions - list permissions for a role
router.get('/roles/:id/permissions', requireOrgContext, async (req, res) => {
  try {
    const { id } = req.params;
    const role = await db.get('SELECT org_id FROM roles WHERE id = $1', [id]);
    if (!role) return res.status(404).json({ ok: false, message: 'Role not found' });
    if (!(await canAccessOrg(req, role.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    const perms = await getPermissionsForRole(id);
    res.json({ ok: true, data: perms });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PUT /api/uhpcms/org-admin/roles/:id/permissions - set permissions for a role (replace all)
router.put('/roles/:id/permissions', requireOrgContext, audit('org_admin', 'set_role_permissions'), async (req, res) => {
  try {
    const { id } = req.params;
    const role = await db.get('SELECT org_id FROM roles WHERE id = $1', [id]);
    if (!role) return res.status(404).json({ ok: false, message: 'Role not found' });
    if (!(await canAccessOrg(req, role.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
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

// DELETE /api/uhpcms/org-admin/roles/:id - delete a custom role (not system roles)
router.delete('/roles/:id', requireOrgContext, audit('org_admin', 'delete_role'), async (req, res) => {
  try {
    const { id } = req.params;
    const role = await db.get('SELECT org_id, is_system FROM roles WHERE id = $1', [id]);
    if (!role) return res.status(404).json({ ok: false, message: 'Role not found' });
    if (!(await canAccessOrg(req, role.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    if (role.is_system) return res.status(400).json({ ok: false, message: 'Cannot delete a system role' });
    const users = await db.get('SELECT COUNT(*) AS c FROM system_users WHERE role_id = $1', [id]);
    if (users?.c > 0) return res.status(400).json({ ok: false, message: 'Cannot delete a role that is assigned to users' });
    await db.run('DELETE FROM role_permissions WHERE role_id = $1', [id]);
    await db.run('DELETE FROM roles WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// GET /api/uhpcms/org-admin/permissions - full permission catalog (grouped by module)
router.get('/permissions', requireOrgContext, async (req, res) => {
  try {
    const rows = await db.query('SELECT id, module, action, description FROM permissions ORDER BY module, action');
    const grouped = {};
    for (const r of rows) (grouped[r.module] = grouped[r.module] || []).push(r);
    res.json({ ok: true, data: rows, grouped });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Branding ----------
// GET /api/uhpcms/org-admin/branding - org branding (logo, signature, contact)
router.get('/branding', requireOrgContext, audit('org_admin', 'view_branding'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const row = await db.get(
      'SELECT id, name, type, kind, logo_base64, signature_base64, address, phone, email, country, website_slug FROM organizations WHERE id = $1',
      [orgId]
    );
    if (!row) return res.status(404).json({ ok: false, message: 'Organization not found' });
    res.json({ ok: true, data: row });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PUT /api/uhpcms/org-admin/branding - update branding (logo, signature, address, phone, email, country)
router.put('/branding', requireOrgContext, audit('org_admin', 'update_branding'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const { logo_base64, signature_base64, address, phone, email, country, name, website_slug } = req.body || {};
    const existing = await db.get('SELECT id FROM organizations WHERE id = $1', [orgId]);
    if (!existing) return res.status(404).json({ ok: false, message: 'Organization not found' });
    const sets = [];
    const params = [];
    const push = (col, val) => { if (val !== undefined && val !== null) { sets.push(`${col} = $${params.length + 1}`); params.push(val); } };
    push('name', name);
    push('logo_base64', logo_base64);
    push('signature_base64', signature_base64);
    push('address', address);
    push('phone', phone);
    push('email', email);
    push('country', country);
    push('website_slug', website_slug);
    if (sets.length) {
      params.push(orgId);
      await db.run(`UPDATE organizations SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    }
    const row = await db.get(
      'SELECT id, name, type, kind, logo_base64, signature_base64, address, phone, email, country, website_slug FROM organizations WHERE id = $1',
      [orgId]
    );
    res.json({ ok: true, data: row });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Add-ons (org admin manages own org add-ons) ----------
// GET /api/uhpcms/org-admin/addons
router.get('/addons', requireOrgContext, async (req, res) => {
  try {
    const orgId = req.orgId;
    const rows = await db.query('SELECT addon_name, enabled FROM org_addons WHERE org_id = $1', [orgId]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    if (e.code === '42P01' || e.message?.includes('does not exist') || e.message?.includes('no such table')) {
      return res.json({ ok: true, data: [] });
    }
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PUT /api/uhpcms/org-admin/addons
router.put('/addons', requireOrgContext, audit('org_admin', 'update_addons'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const { addons } = req.body || {};
    if (!Array.isArray(addons)) return res.status(400).json({ ok: false, message: 'addons array required' });
    for (const { name, enabled } of addons) {
      await db.run(
        'INSERT INTO org_addons (org_id, addon_name, enabled) VALUES ($1, $2, $3) ON CONFLICT(org_id, addon_name) DO UPDATE SET enabled = $3',
        [orgId, name, enabled ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Branch / clinic management (org admin creates children) ----------
// GET /api/uhpcms/org-admin/branches - list child orgs
router.get('/branches', requireOrgContext, async (req, res) => {
  try {
    const orgId = req.orgId;
    const rows = await db.query(
      `SELECT id, name, type, kind, status, address, phone, country, created_at
       FROM organizations WHERE parent_org_id = $1 ORDER BY name`,
      [orgId]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/org-admin/branches - create branch/clinic under own org
router.post('/branches', requireOrgContext, audit('org_admin', 'create_branch'), async (req, res) => {
  try {
    const parentId = req.orgId;
    const parent = await db.get('SELECT id, subscription_plan FROM organizations WHERE id = $1', [parentId]);
    if (!parent) return res.status(404).json({ ok: false, message: 'Organization not found' });
    const { name, type = 'clinic', admin_email, admin_password, admin_name, address, phone, email, country } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, message: 'name required' });
    if (!['branch', 'clinic'].includes(type)) return res.status(400).json({ ok: false, message: 'type must be branch or clinic' });

    const id = await ids.getNextOrganizationId();
    await db.run(
      `INSERT INTO organizations (id, name, type, kind, status, subscription_plan, parent_org_id,
         address, phone, email, country, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, ${db.NOW})`,
      [id, name, type === 'branch' ? 'hospital' : 'clinic', type, 'active', parent.subscription_plan || 'standard',
        parentId, address || null, phone || null, email || null, country || 'Liberia', req.user.sub || null]
    );
    // roles for the branch
    const roleSet = [
      ['role_org_admin_' + id, 'org_admin', 1],
      ['role_doctor_' + id, 'doctor', 1],
      ['role_nurse_' + id, 'nurse', 1],
      ['role_receptionist_' + id, 'receptionist', 1],
      ['role_pharmacist_' + id, 'pharmacist', 1],
      ['role_accountant_' + id, 'accountant', 1],
      ['role_representative_' + id, 'representative', 1],
      ['role_branch_head_' + id, 'branch_head', 1],
      ['role_department_head_' + id, 'department_head', 0],
    ];
    for (const [rid, rname, isSystem] of roleSet) {
      await db.run('INSERT INTO roles (id, name, org_id, is_system) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING', [rid, rname, id, isSystem]);
    }
    // inherit modules from parent
    const parentMods = await db.query('SELECT module_name, enabled FROM org_modules WHERE org_id = $1', [parentId]);
    for (const m of parentMods) {
      await db.run(
        'INSERT INTO org_modules (org_id, module_name, enabled) VALUES ($1, $2, $3) ON CONFLICT (org_id, module_name) DO NOTHING',
        [id, m.module_name, m.enabled]
      );
    }
    let adminUserId = null;
    if (admin_email && admin_password) {
      const userId = await ids.getNextUserId();
      const hash = await bcrypt.hash(String(admin_password), 10);
      const email = String(admin_email).trim().toLowerCase();
      await db.run(
        `INSERT INTO system_users (id, org_id, email, username, password_hash, role_id, full_name, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${db.NOW})`,
        [userId, id, email, email, hash, 'role_org_admin_' + id, admin_name || null, 'active']
      );
      adminUserId = userId;
    }
    res.status(201).json({ ok: true, id, name, kind: type, parent_org_id: parentId, admin_user_id: adminUserId });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Departments ----------
router.get('/departments', requireOrgContext, audit('org_admin', 'list_departments'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const rows = await db.query('SELECT id, org_id, name, created_at FROM departments WHERE org_id = $1 ORDER BY name', [orgId]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/departments', requireOrgContext, audit('org_admin', 'create_department'), async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, message: 'name required' });
    const orgId = req.orgId;
    const id = await ids.getNextPrefixedId('departments', 'id', 'DEPT-', 'org_id', orgId);
    await db.run('INSERT INTO departments (id, org_id, name) VALUES ($1, $2, $3)', [id, orgId, name]);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Wards ----------
router.get('/wards', requireOrgContext, audit('org_admin', 'list_wards'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const rows = await db.query('SELECT id, org_id, name, bed_count, created_at FROM wards WHERE org_id = $1 ORDER BY name', [orgId]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/wards', requireOrgContext, audit('org_admin', 'create_ward'), async (req, res) => {
  try {
    const { name, bed_count } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, message: 'name required' });
    const orgId = req.orgId;
    const id = await ids.getNextPrefixedId('wards', 'id', 'WARD-', 'org_id', orgId);
    await db.run('INSERT INTO wards (id, org_id, name, bed_count) VALUES ($1, $2, $3, $4)', [id, orgId, name, bed_count || 0]);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Pharmacy stores ----------
router.get('/pharmacy-stores', requireOrgContext, audit('org_admin', 'list_stores'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const rows = await db.query('SELECT id, org_id, name, created_at FROM pharmacy_stores WHERE org_id = $1 ORDER BY name', [orgId]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/pharmacy-stores', requireOrgContext, audit('org_admin', 'create_store'), async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, message: 'name required' });
    const orgId = req.orgId;
    const id = await ids.getNextPrefixedId('pharmacy_stores', 'id', 'STORE-', 'org_id', orgId);
    await db.run('INSERT INTO pharmacy_stores (id, org_id, name) VALUES ($1, $2, $3)', [id, orgId, name]);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Services (billing codes) ----------
router.get('/services', requireOrgContext, audit('org_admin', 'list_services'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const rows = await db.query('SELECT id, org_id, code, name, default_amount, default_currency, created_at FROM services WHERE org_id = $1 ORDER BY code', [orgId]);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

router.post('/services', requireOrgContext, audit('org_admin', 'create_service'), async (req, res) => {
  try {
    const { code, name, default_amount, default_currency } = req.body || {};
    if (!code || !name) return res.status(400).json({ ok: false, message: 'code and name required' });
    const orgId = req.orgId;
    const id = await ids.getNextPrefixedId('services', 'id', 'SVC-', 'org_id', orgId);
    await db.run(
      'INSERT INTO services (id, org_id, code, name, default_amount, default_currency) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, orgId, code, name, default_amount != null ? Number(default_amount) : null, default_currency || 'USD']
    );
    res.status(201).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ---------- Users (org-level, includes branch users) ----------
// GET /api/uhpcms/org-admin/users - list users for own org + child branches
router.get('/users', requireOrgContext, audit('org_admin', 'list_users'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const rows = await db.query(
      `SELECT u.id, u.org_id, u.email, u.role_id, u.department_id, u.full_name, u.status, u.created_at,
              r.name AS role_name, o.name AS org_name, o.kind AS org_kind
       FROM system_users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN organizations o ON o.id = u.org_id
       WHERE u.org_id = $1 OR u.org_id IN (SELECT id FROM organizations WHERE parent_org_id = $2)
       ORDER BY u.org_id, u.email`,
      [orgId, orgId]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    if (e.code === '42P01' || e.message?.includes('does not exist') || e.message?.includes('no such table')) {
      return res.json({ ok: true, data: [] });
    }
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /api/uhpcms/org-admin/users - create user (org admin; may target a child branch via target_org_id)
router.post('/users', requireOrgContext, audit('org_admin', 'create_user'), async (req, res) => {
  try {
    // Note: requireOrgContext overwrites req.body.org_id, so use target_org_id for child org targeting
    const { email, password, role_id, department_id, full_name, target_org_id } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, message: 'email and password required' });
    if (String(password).length < 6) return res.status(400).json({ ok: false, message: 'password must be at least 6 characters' });
    const targetOrg = target_org_id || req.orgId;
    if (!(await canAccessOrg(req, targetOrg))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });

    const cleanEmail = String(email).trim().toLowerCase();
    const dup = await db.get('SELECT id FROM system_users WHERE LOWER(TRIM(email)) = $1', [cleanEmail]);
    if (dup) return res.status(400).json({ ok: false, message: 'An account with that email already exists' });

    const defaultRoleId = `role_org_admin_${targetOrg}`;
    const finalRole = role_id || defaultRoleId;
    const roleRow = await db.get('SELECT id FROM roles WHERE id = $1 AND org_id = $2', [finalRole, targetOrg]);
    if (!roleRow) return res.status(400).json({ ok: false, message: 'Role does not belong to the target organization' });

    const id = await ids.getNextUserId();
    const hash = await bcrypt.hash(password, 10);
    await db.run(
      `INSERT INTO system_users (id, org_id, email, username, password_hash, role_id, department_id, full_name, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${db.NOW})`,
      [id, targetOrg, cleanEmail, cleanEmail, hash, finalRole, department_id || null, full_name || null, 'active']
    );
    res.status(201).json({ ok: true, id, org_id: targetOrg, role_id: finalRole });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// PATCH /api/uhpcms/org-admin/users/:id - update user (same org or child branch)
router.patch('/users/:id', requireOrgContext, audit('org_admin', 'update_user'), async (req, res) => {
  try {
    const { id } = req.params;
    const { email, full_name, role_id, department_id, status, password } = req.body || {};
    const existing = await db.get('SELECT id, org_id FROM system_users WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'User not found' });
    if (!(await canAccessOrg(req, existing.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });

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

// DELETE /api/uhpcms/org-admin/users/:id - deactivate user (same org or child branch)
router.delete('/users/:id', requireOrgContext, audit('org_admin', 'delete_user'), async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.sub || req.user?.id;
    if (currentUserId && id === currentUserId) {
      return res.status(400).json({ ok: false, message: 'You cannot delete your own account.' });
    }
    const existing = await db.get('SELECT id, org_id FROM system_users WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ ok: false, message: 'User not found' });
    if (!(await canAccessOrg(req, existing.org_id))) return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
    await db.run('UPDATE system_users SET status = $1 WHERE id = $2', ['inactive', id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
