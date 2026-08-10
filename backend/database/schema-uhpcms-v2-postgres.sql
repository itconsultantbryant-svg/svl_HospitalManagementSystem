-- U-HPCMS v2: Triage, Lab, Inpatient, Pharmacy, Clinic, HR, Assets, Add-ons
-- PostgreSQL variant. Uses IF NOT EXISTS for idempotent execution.

-- Pharmacy stores per organization
CREATE TABLE IF NOT EXISTS pharmacy_stores (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services & billing codes (per org)
CREATE TABLE IF NOT EXISTS services (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  default_amount REAL,
  default_currency VARCHAR(8) DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, code)
);

-- Drugs catalog (for prescriptions)
CREATE TABLE IF NOT EXISTS drugs (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64),
  unit VARCHAR(64) DEFAULT 'unit',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prescription line items
CREATE TABLE IF NOT EXISTS prescription_items (
  id VARCHAR(64) PRIMARY KEY,
  prescription_id VARCHAR(64) NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  drug_id VARCHAR(64) NOT NULL REFERENCES drugs(id),
  quantity REAL NOT NULL,
  dosage TEXT,
  duration TEXT
);

-- Pharmacy inventory (per store, per drug)
CREATE TABLE IF NOT EXISTS pharmacy_inventory (
  id SERIAL PRIMARY KEY,
  store_id VARCHAR(64) NOT NULL REFERENCES pharmacy_stores(id),
  drug_id VARCHAR(64) NOT NULL REFERENCES drugs(id),
  quantity REAL NOT NULL DEFAULT 0,
  batch VARCHAR(128),
  expiry TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments (clinic workflow)
CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL REFERENCES organizations(id),
  patient_mrn VARCHAR(64) NOT NULL,
  department_id VARCHAR(64) REFERENCES departments(id),
  doctor_id VARCHAR(64),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'checked_in', 'completed', 'cancelled', 'no_show')),
  encounter_id VARCHAR(64) REFERENCES encounters(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insurance claims
CREATE TABLE IF NOT EXISTS insurance_claims (
  id VARCHAR(64) PRIMARY KEY,
  invoice_id VARCHAR(64) NOT NULL REFERENCES invoices(id),
  policy_number VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'approved', 'rejected', 'reimbursed')),
  submitted_at TIMESTAMPTZ,
  reimbursed_at TIMESTAMPTZ,
  amount_claimed REAL,
  amount_reimbursed REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets (equipment)
CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(64) PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64),
  department_id VARCHAR(64) REFERENCES departments(id),
  status VARCHAR(32) DEFAULT 'active' CHECK(status IN ('active', 'maintenance', 'retired')),
  last_maintenance TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add-on catalog (super-admin installs)
CREATE TABLE IF NOT EXISTS addon_catalog (
  name VARCHAR(128) PRIMARY KEY,
  display_name VARCHAR(255),
  enabled INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HR: attendance (simplified: check-in/out per user per day)
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES system_users(id),
  date TIMESTAMPTZ NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  UNIQUE(user_id, date)
);

-- HR: leave requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES system_users(id),
  from_date TIMESTAMPTZ NOT NULL,
  to_date TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  approved_by VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pharmacy_inventory_store ON pharmacy_inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_appointments_org ON appointments(org_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
