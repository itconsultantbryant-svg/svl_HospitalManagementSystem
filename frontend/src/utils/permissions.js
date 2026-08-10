// Permission helpers for the permission-driven UI.
// Admin/system roles hold every permission, so they bypass the permission list.
export const ADMIN_ROLE_NAMES = [
  'super_admin',
  'role_super_admin',
  'org_admin',
  'administrator',
  'admin',
];

export function isAdminRole(role) {
  return ADMIN_ROLE_NAMES.includes(String(role || '').toLowerCase());
}

/**
 * Does this user hold `perm` (e.g. 'lab:view')?
 * - Admin roles always pass.
 * - If the user has NO permissions array (legacy login / role-based users),
 *   we fall back to allowing everything so existing behavior is preserved.
 */
export function hasPermission(user, perm) {
  if (!user) return false;
  if (isAdminRole(user.role)) return true;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (perms.length === 0) return true; // role-based / legacy user — no permission data
  return perms.includes(perm);
}

/** True when the user carries an explicit (non-empty) permission list. */
export function hasPermissionList(user) {
  return Array.isArray(user?.permissions) && user.permissions.length > 0;
}
