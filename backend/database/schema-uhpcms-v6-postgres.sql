-- U-HPCMS v6: Multi-tenant hierarchy, hospital branding, custom roles & granular permissions
-- PostgreSQL variant. Uses ADD COLUMN IF NOT EXISTS so it is safe to run repeatedly.

-- Organizations: org hierarchy + branding
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS parent_org_id TEXT REFERENCES organizations(id);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_base64 TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS signature_base64 TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Liberia';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'hospital';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_website_slug ON organizations(website_slug) WHERE website_slug IS NOT NULL AND website_slug != '';

-- Roles: custom role support
ALTER TABLE roles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system INTEGER DEFAULT 0;

-- System users: username + avatar
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS avatar_base64 TEXT;

-- Audit log: target user for cross-org monitoring
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_user_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS module_name TEXT;

-- Granular permissions (feature-level access control) — id = module:action
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE(module, action)
);

-- Role ↔ permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions(permission_id);

CREATE INDEX IF NOT EXISTS idx_org_parent ON organizations(parent_org_id);
CREATE INDEX IF NOT EXISTS idx_org_modules_org ON org_modules(org_id);
