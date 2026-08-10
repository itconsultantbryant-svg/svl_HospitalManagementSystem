/**
 * Permission helpers for U-HPCMS v6 multi-tenant access control.
 * Resolves a user's effective permissions from role_permissions, with
 * fallback maps for legacy role names.
 */
const db = require('../db');
const { ROLE_PERMISSIONS, ALL_IDS } = require('../scripts/seed-permissions');

/** Role names that are treated as full-access (platform / org administrators). */
const ADMIN_ROLE_NAMES = new Set(['super_admin', 'org_admin', 'administrator', 'admin']);

/** Strip role_ prefix / org suffix from a role id or name to get its base name. */
function baseRoleName(roleIdOrName) {
  let n = String(roleIdOrName || '')
    .trim()
    .toLowerCase()
    .replace(/^role_/, '');
  n = n.replace(/_org_[a-z0-9_]+$/, '');
  return n;
}

/** Resolve permission ids for a role id (from role_permissions, or legacy map fallback). */
async function getPermissionsForRole(roleId) {
  if (!roleId) return [];
  const rows = await db.query(
    `SELECT p.id FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1`,
    [roleId]
  );
  if (rows.length) return rows.map((r) => r.id);
  // Legacy role not present in role_permissions: use built-in map by base name
  const base = baseRoleName(roleId);
  return ROLE_PERMISSIONS[base] || [];
}

/** All permission ids in the catalog. */
async function getAllPermissionIds() {
  try {
    const rows = await db.query('SELECT id FROM permissions');
    if (rows.length) return rows.map((r) => r.id);
  } catch (_) {}
  return ALL_IDS;
}

/**
 * Resolve effective permissions for a user row.
 * @param {object} userRow  { role_id, role, org_id }
 * @returns {Promise<string[]>}
 */
async function getPermissionsForUser(userRow) {
  const roleName = baseRoleName(userRow?.role || userRow?.role_name || userRow?.role_id || '');
  if (ADMIN_ROLE_NAMES.has(roleName)) return getAllPermissionIds();
  if (userRow?.role_id) {
    const byRole = await getPermissionsForRole(userRow.role_id);
    if (byRole.length) return byRole;
  }
  return ROLE_PERMISSIONS[roleName] || [];
}

/** Branding + hierarchy context for an organization. */
async function getOrgBranding(orgId) {
  if (!orgId) return null;
  const row = await db.get(
    `SELECT id, name, type, kind, parent_org_id, logo_base64, signature_base64,
            address, phone, email, country, status, subscription_plan, website_slug
     FROM organizations WHERE id = $1`,
    [orgId]
  );
  if (!row) return null;
  let parent = null;
  if (row.parent_org_id) {
    parent = await db.get('SELECT id, name, logo_base64 FROM organizations WHERE id = $1', [row.parent_org_id]);
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    kind: row.kind || (row.parent_org_id ? 'branch' : 'hospital'),
    parent_org_id: row.parent_org_id || null,
    parent_name: parent?.name || null,
    parent_logo: parent?.logo_base64 || null,
    logo: row.logo_base64 || parent?.logo_base64 || null,
    signature: row.signature_base64 || null,
    address: row.address || null,
    phone: row.phone || null,
    email: row.email || null,
    country: row.country || 'Liberia',
    status: row.status,
    subscription_plan: row.subscription_plan,
    website_slug: row.website_slug || null,
  };
}

/**
 * Resolve a website slug or org ID to an org ID.
 * Tries slug lookup first, falls back to ID lookup.
 */
async function resolveWebsiteSlug(slugOrId) {
  if (!slugOrId) return null;
  const bySlug = await db.get(
    `SELECT id FROM organizations WHERE website_slug = $1`,
    [slugOrId]
  );
  if (bySlug) return bySlug.id;
  const byId = await db.get(`SELECT id FROM organizations WHERE id = $1`, [slugOrId]);
  return byId ? byId.id : null;
}

module.exports = {
  baseRoleName,
  getPermissionsForRole,
  getAllPermissionIds,
  getPermissionsForUser,
  getOrgBranding,
  resolveWebsiteSlug,
  ADMIN_ROLE_NAMES,
};
