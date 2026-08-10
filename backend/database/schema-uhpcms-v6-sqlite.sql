-- U-HPCMS v6: Multi-tenant hierarchy, hospital branding, custom roles & granular permissions
-- SQLite variant.
--
-- NOTE: column additions to existing tables (organizations, roles, system_users, audit_log)
-- are applied idempotently in db/sqlite.js init() (try/catch per column). This file only
-- carries CREATE TABLE IF NOT EXISTS statements so it is safe to exec on every boot.

-- Granular permissions (feature-level access control) — id = module:action
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE(module, action)
);

-- Role ↔ permission mapping (roles table extended in v6 with description/is_system)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_id);

-- NOTE: idx_org_parent on organizations(parent_org_id) is created in db/sqlite.js
-- init() AFTER the parent_org_id column is added (ALTER runs post-exec here).
