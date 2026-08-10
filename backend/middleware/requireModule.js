const db = require('../db');
const { ensureOrgContext } = require('./orgCheck');
const { ADMIN_ROLE_NAMES } = require('../lib/permissions');

/**
 * Resolve the org whose module settings apply. Branch/clinic organizations
 * inherit their parent hospital's module configuration.
 */
async function resolveEffectiveOrgId(orgId) {
  if (!orgId) return null;
  const row = await db.get('SELECT parent_org_id FROM organizations WHERE id = $1', [orgId]);
  return row?.parent_org_id || orgId;
}

/**
 * Middleware: require the organization to have at least one of the given modules enabled.
 * Pass a string (e.g. 'lab') or array (e.g. ['hospital', 'clinic']).
 * Platform admins (super_admin/org_admin/administrator) and org-less users bypass.
 */
function requireModule(moduleOrModules) {
  return async (req, res, next) => {
    try {
      if (req.user?.role && ADMIN_ROLE_NAMES.has(String(req.user.role).toLowerCase())) return next();
      await ensureOrgContext(req).catch(() => null);
      const orgId = await resolveEffectiveOrgId(req.orgId);
      if (!orgId) return next(); // no org context — nothing to gate on
      const mods = Array.isArray(moduleOrModules) ? moduleOrModules : [moduleOrModules];
      for (const m of mods) {
        const row = await db.get(
          'SELECT enabled FROM org_modules WHERE org_id = $1 AND module_name = $2',
          [orgId, m]
        );
        if (row && (row.enabled === 1 || row.enabled === true || String(row.enabled) === '1')) {
          return next();
        }
      }
      return res.status(403).json({
        ok: false,
        message: `This feature is not enabled for your organization`,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, message: e.message });
    }
  };
}

module.exports = { requireModule, resolveEffectiveOrgId };
