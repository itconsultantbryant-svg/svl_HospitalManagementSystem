/**
 * Seed granular permissions + role → permission mappings for U-HPCMS v6.
 * Idempotent: safe to run on every deploy. Assigns permissions to existing
 * built-in roles by name and marks them as system roles.
 *
 *   node scripts/seed-permissions.js
 */
const config = require('../config');
const db = require('../db');

// [id, module, action, description]
const ALL_PERMISSIONS = [
  // Patients
  ['patients:view', 'patients', 'view', 'View patient records'],
  ['patients:create', 'patients', 'create', 'Register patients'],
  ['patients:edit', 'patients', 'edit', 'Edit patient records'],
  ['patients:delete', 'patients', 'delete', 'Delete patient records'],
  ['patients:transfer', 'patients', 'transfer', 'Transfer patients between orgs'],
  // Encounters
  ['encounters:view', 'encounters', 'view', 'View encounters'],
  ['encounters:create', 'encounters', 'create', 'Create encounters'],
  ['encounters:update', 'encounters', 'update', 'Update encounters'],
  // Triage
  ['triage:view', 'triage', 'view', 'View triage'],
  ['triage:create', 'triage', 'create', 'Perform triage'],
  // Lab
  ['lab:view', 'lab', 'view', 'View lab orders'],
  ['lab:create', 'lab', 'create', 'Order lab tests'],
  ['lab:approve', 'lab', 'approve', 'Approve lab results'],
  ['lab:result', 'lab', 'result', 'Submit lab results'],
  // Pharmacy
  ['pharmacy:view', 'pharmacy', 'view', 'View pharmacy and prescriptions'],
  ['pharmacy:create', 'pharmacy', 'create', 'Create prescriptions'],
  ['pharmacy:dispense', 'pharmacy', 'dispense', 'Dispense medication'],
  ['pharmacy:inventory', 'pharmacy', 'inventory', 'Manage drug inventory'],
  // Billing
  ['billing:view', 'billing', 'view', 'View billing'],
  ['billing:create', 'billing', 'create', 'Create charges and invoices'],
  ['billing:approve', 'billing', 'approve', 'Approve invoices and payments'],
  ['billing:refund', 'billing', 'refund', 'Process refunds'],
  // Inpatient
  ['inpatient:view', 'inpatient', 'view', 'View admissions'],
  ['inpatient:admit', 'inpatient', 'admit', 'Admit patients'],
  ['inpatient:discharge', 'inpatient', 'discharge', 'Discharge patients'],
  ['inpatient:bed_assign', 'inpatient', 'bed_assign', 'Assign beds'],
  // Clinic
  ['clinic:view', 'clinic', 'view', 'View clinic queue'],
  ['clinic:book', 'clinic', 'book', 'Book clinic appointments'],
  ['clinic:checkin', 'clinic', 'checkin', 'Check-in patients'],
  ['clinic:complete', 'clinic', 'complete', 'Complete visits'],
  // Appointments
  ['appointments:view', 'appointments', 'view', 'View appointments'],
  ['appointments:book', 'appointments', 'book', 'Book appointments'],
  ['appointments:cancel', 'appointments', 'cancel', 'Cancel appointments'],
  // Schedule
  ['schedule:view', 'schedule', 'view', 'View schedules'],
  ['schedule:manage', 'schedule', 'manage', 'Manage schedules'],
  // Doctors
  ['doctors:view', 'doctors', 'view', 'View doctors'],
  ['doctors:manage', 'doctors', 'manage', 'Manage doctors'],
  // Departments
  ['departments:view', 'departments', 'view', 'View departments'],
  ['departments:manage', 'departments', 'manage', 'Manage departments'],
  // Insurance
  ['insurance:view', 'insurance', 'view', 'View insurance policies'],
  ['insurance:manage', 'insurance', 'manage', 'Manage insurance policies'],
  // Beds
  ['beds:view', 'beds', 'view', 'View beds'],
  ['beds:manage', 'beds', 'manage', 'Manage beds'],
  // Reporting
  ['reporting:view', 'reporting', 'view', 'View reports'],
  ['reporting:export', 'reporting', 'export', 'Export reports'],
  // Finance
  ['finance:view', 'finance', 'view', 'View finance dashboard'],
  ['finance:manage', 'finance', 'manage', 'Manage finance settings'],
  // HRM
  ['hrm:view', 'hrm', 'view', 'View HR module'],
  ['hrm:manage', 'hrm', 'manage', 'Manage staff and HR'],
  // Org admin
  ['org_admin:manage_users', 'org_admin', 'manage_users', 'Create and manage staff users'],
  ['org_admin:manage_departments', 'org_admin', 'manage_departments', 'Manage departments'],
  ['org_admin:manage_roles', 'org_admin', 'manage_roles', 'Manage roles and permissions'],
  ['org_admin:manage_branding', 'org_admin', 'manage_branding', 'Manage hospital logo and signature'],
  ['org_admin:manage_branches', 'org_admin', 'manage_branches', 'Manage branches and clinics'],
  ['org_admin:manage_addons', 'org_admin', 'manage_addons', 'Delegate add-ons to branches'],
  // Governance (super admin)
  ['governance:view', 'governance', 'view', 'View governance dashboard'],
  ['governance:manage_orgs', 'governance', 'manage_orgs', 'Create and manage organizations'],
  ['governance:manage_roles', 'governance', 'manage_roles', 'Manage roles across organizations'],
  ['governance:monitor', 'governance', 'monitor', 'Cross-org monitoring'],
  ['governance:audit', 'governance', 'audit', 'Cross-org audit'],
  // Noticeboard
  ['noticeboard:view', 'noticeboard', 'view', 'View notices'],
  ['noticeboard:post', 'noticeboard', 'post', 'Post notices'],
  // Chat
  ['chat:view', 'chat', 'view', 'View chat'],
  ['chat:send', 'chat', 'send', 'Send chat messages'],
  // Cases
  ['cases:view', 'cases', 'view', 'View case files'],
  ['cases:create', 'cases', 'create', 'Create case files'],
  ['cases:approve', 'cases', 'approve', 'Approve case files'],
  // Activities
  ['activities:view', 'activities', 'view', 'View activities'],
  ['activities:create', 'activities', 'create', 'Log activities'],
  // Settings
  ['settings:view', 'settings', 'view', 'View settings'],
  ['settings:edit', 'settings', 'edit', 'Edit settings'],
  // Audit
  ['audit:view', 'audit', 'view', 'View audit log'],
  // Documents
  ['documents:upload', 'documents', 'upload', 'Upload documents'],
  ['documents:view', 'documents', 'view', 'View documents'],
  ['documents:download', 'documents', 'download', 'Download documents'],
  // Profile & notifications
  ['profile:view', 'profile', 'view', 'View own profile'],
  ['profile:edit', 'profile', 'edit', 'Edit own profile'],
  ['notifications:view', 'notifications', 'view', 'View notifications'],
];

const ALL_IDS = ALL_PERMISSIONS.map((p) => p[0]);

const COMMON_STAFF = [
  'noticeboard:view',
  'chat:view', 'chat:send',
  'settings:view',
  'profile:view', 'profile:edit',
  'notifications:view',
  'documents:view', 'documents:download',
];

// Built-in role → permission ids. super_admin / org_admin get everything.
const ROLE_PERMISSIONS = {
  super_admin: ALL_IDS,
  org_admin: ALL_IDS,
  administrator: ALL_IDS,
  admin: ALL_IDS,
  doctor: [
    ...COMMON_STAFF,
    'patients:view', 'patients:create', 'patients:edit',
    'encounters:view', 'encounters:create', 'encounters:update',
    'triage:view', 'triage:create',
    'lab:view', 'lab:create',
    'pharmacy:view', 'pharmacy:create',
    'inpatient:view', 'inpatient:admit',
    'clinic:view', 'clinic:book', 'clinic:checkin', 'clinic:complete',
    'appointments:view', 'appointments:book',
    'schedule:view', 'doctors:view', 'departments:view', 'insurance:view', 'beds:view',
    'reporting:view',
    'cases:view', 'cases:create',
    'activities:view', 'activities:create',
    'documents:upload',
  ],
  nurse: [
    ...COMMON_STAFF,
    'patients:view', 'patients:create', 'patients:edit',
    'encounters:view',
    'triage:view', 'triage:create',
    'lab:view',
    'pharmacy:view',
    'inpatient:view', 'inpatient:bed_assign',
    'clinic:view', 'clinic:checkin',
    'appointments:view',
    'beds:view',
    'reporting:view',
    'activities:view', 'activities:create',
    'documents:upload',
  ],
  receptionist: [
    ...COMMON_STAFF,
    'patients:view', 'patients:create', 'patients:edit',
    'encounters:view', 'encounters:create',
    'clinic:view', 'clinic:book', 'clinic:checkin', 'clinic:complete',
    'appointments:view', 'appointments:book', 'appointments:cancel',
    'schedule:view',
    'billing:view', 'billing:create',
    'reporting:view',
    'documents:upload',
  ],
  pharmacist: [
    ...COMMON_STAFF,
    'patients:view',
    'encounters:view',
    'pharmacy:view', 'pharmacy:create', 'pharmacy:dispense', 'pharmacy:inventory',
    'billing:view',
    'reporting:view',
  ],
  accountant: [
    ...COMMON_STAFF,
    'patients:view',
    'encounters:view',
    'billing:view', 'billing:create', 'billing:approve', 'billing:refund',
    'finance:view', 'finance:manage',
    'reporting:view', 'reporting:export',
    'audit:view',
  ],
  lab: [
    ...COMMON_STAFF,
    'patients:view',
    'encounters:view',
    'lab:view', 'lab:create', 'lab:approve', 'lab:result',
    'reporting:view',
  ],
  representative: [
    ...COMMON_STAFF,
    'patients:view', 'patients:create',
    'encounters:view', 'encounters:create',
    'clinic:view', 'clinic:book',
    'appointments:view', 'appointments:book',
    'insurance:view', 'insurance:manage',
    'cases:view', 'cases:create',
    'reporting:view',
    'activities:view', 'activities:create',
    'documents:upload',
  ],
};

function baseRoleName(role) {
  let n = String(role.name || role.role_id || '')
    .trim()
    .toLowerCase()
    .replace(/^role_/, '');
  // strip org suffix like _org_xxx or _<orgid>
  n = n.replace(/_org_[a-z0-9_]+$/, '');
  return n;
}

async function upsertPermissions() {
  for (const [id, module, action, description] of ALL_PERMISSIONS) {
    const insert = config.dbType === 'postgres'
      ? 'INSERT INTO permissions (id, module, action, description) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING'
      : 'INSERT OR IGNORE INTO permissions (id, module, action, description) VALUES ($1, $2, $3, $4)';
    await db.run(insert, [id, module, action, description]);
  }
}

async function assignRolePermissions(roleId, permissionIds) {
  const insert = config.dbType === 'postgres'
    ? 'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT (role_id, permission_id) DO NOTHING'
    : 'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES ($1, $2)';
  for (const pid of permissionIds) {
    await db.run(insert, [roleId, pid]);
  }
}

async function seedPermissions() {
  await db.init();
  await upsertPermissions();
  console.log(`Seeded ${ALL_PERMISSIONS.length} permissions.`);

  const roles = await db.query('SELECT id, name, org_id FROM roles');
  let assigned = 0;
  for (const role of roles) {
    const base = baseRoleName(role);
    const perms = ROLE_PERMISSIONS[base];
    if (perms) {
      await assignRolePermissions(role.id, perms);
      try {
        await db.run('UPDATE roles SET is_system = 1 WHERE id = $1', [role.id]);
      } catch (_) {}
      assigned++;
    }
  }
  console.log(`Assigned permissions to ${assigned} built-in role(s).`);

  // Ensure a global super_admin role exists (org_id IS NULL) with all permissions
  const superRole = await db.get("SELECT id FROM roles WHERE name = 'super_admin' AND (org_id IS NULL OR org_id = '') LIMIT 1");
  if (superRole) {
    await assignRolePermissions(superRole.id, ALL_IDS);
    try {
      await db.run('UPDATE roles SET is_system = 1 WHERE id = $1', [superRole.id]);
    } catch (_) {}
  } else {
    const id = 'role_super_admin';
    const exists = await db.get('SELECT id FROM roles WHERE id = $1', [id]);
    if (!exists) {
      await db.run("INSERT INTO roles (id, name, org_id, description, is_system) VALUES ($1, 'super_admin', NULL, 'Platform super administrator', 1)", [id]);
    }
    await assignRolePermissions(id, ALL_IDS);
  }

  console.log('Permission seed complete.');
}

module.exports = { seedPermissions, ALL_PERMISSIONS, ROLE_PERMISSIONS, ALL_IDS };

// Auto-run when executed directly: node scripts/seed-permissions.js
if (require.main === module) {
  seedPermissions().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
