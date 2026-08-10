const db = require('../db');

/**
 * Resolve the org context for a request. Order of precedence:
 *  1. req.orgId (already resolved)
 *  2. req.user.org_id (JWT — the user's own organization)
 *  3. Explicit org selector (query ?org_id=, body org_id, header X-Org-Id)
 *     — used by super_admin to operate across organizations.
 *
 * Multi-tenant mode: there is NO implicit "default hospital". A user without
 * an org context stays org-less (super_admin) unless one is supplied.
 */
async function ensureOrgContext(req) {
  if (req?.orgId) return req.orgId;
  if (req?.user?.org_id) {
    req.orgId = req.user.org_id;
    return req.orgId;
  }
  const explicit = req?.query?.org_id || req?.body?.org_id || req?.headers?.['x-org-id'];
  if (explicit) {
    req.orgId = explicit;
    if (req.user) req.user.org_id = explicit;
    return explicit;
  }
  if (req) req.orgId = null;
  return null;
}

async function requireOrgActive(req, res, next) {
  if (!req.user) return next();
  const orgId = await ensureOrgContext(req);
  if (!orgId) return next();
  try {
    const row = await db.get('SELECT status FROM organizations WHERE id = $1', [orgId]);
    if (row?.status === 'suspended') {
      return res.status(403).json({ ok: false, message: 'Organization is suspended' });
    }
  } catch (_) {}
  next();
}

module.exports = { requireOrgActive, ensureOrgContext };
