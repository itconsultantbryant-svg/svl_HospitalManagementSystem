-- U-HPCMS v3: Patient transfers
-- PostgreSQL variant. Uses IF NOT EXISTS for idempotent execution.

-- Patient transfers (between facilities / to or from hospital)
CREATE TABLE IF NOT EXISTS patient_transfers (
  id VARCHAR(64) PRIMARY KEY,
  from_org_id VARCHAR(64) NOT NULL REFERENCES organizations(id),
  to_org_id VARCHAR(64) NOT NULL REFERENCES organizations(id),
  from_mrn VARCHAR(64) NOT NULL,
  to_mrn VARCHAR(64),
  transfer_type VARCHAR(32) NOT NULL CHECK(transfer_type IN ('to_hospital', 'from_hospital', 'between')),
  reason TEXT,
  summary_notes TEXT,
  encounter_id_at_source VARCHAR(64) REFERENCES encounters(id),
  encounter_id_at_dest VARCHAR(64) REFERENCES encounters(id),
  transferred_by VARCHAR(64),
  transferred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_transfers_from ON patient_transfers(from_org_id, from_mrn);
CREATE INDEX IF NOT EXISTS idx_patient_transfers_to ON patient_transfers(to_org_id, to_mrn);