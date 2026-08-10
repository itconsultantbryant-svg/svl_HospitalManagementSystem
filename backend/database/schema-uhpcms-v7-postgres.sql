-- U-HPCMS v7: Public-facing hospital website support (public appointment requests)
-- PostgreSQL variant. CREATE TABLE IF NOT EXISTS so it is safe to run on every boot.

-- Appointment requests submitted from the public hospital website (no login required).
CREATE TABLE IF NOT EXISTS public_appointments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  message TEXT,
  department_id TEXT,
  doctor_id TEXT,
  preferred_date TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_public_appointments_org ON public_appointments(org_id);
