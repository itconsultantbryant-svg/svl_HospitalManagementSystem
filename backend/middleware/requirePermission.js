const { ADMIN_ROLE_NAMES } = require('../lib/permissions');

/**
 * Middleware: require the authenticated user to hold a specific permission,
 * e.g. requirePermission('lab', 'approve') → needs 'lab:approve'.
 * Platform / org administrators bypass (they hold all permissions by seed).
 */
function requirePermission(module, action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Authentication required' });
    const role = String(req.user.role || '').toLowerCase();
    if (ADMIN_ROLE_NAMES.has(role)) return next();
    const perms = req.user.permissions || [];
    if (perms.includes(`${module}:${action}`)) return next();
    return res.status(403).json({ ok: false, message: 'Insufficient permissions' });
  };
}

module.exports = { requirePermission };
