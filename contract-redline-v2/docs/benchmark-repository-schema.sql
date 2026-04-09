-- Reference schema for production Postgres (v2). v1 ships with in-memory store only.
-- Source: benchmark-repository-schema.md

CREATE TABLE contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_name       TEXT NOT NULL,
  supplier_name       TEXT NOT NULL,
  client_name         TEXT NOT NULL,
  contract_type       TEXT NOT NULL CHECK (contract_type IN ('Services', 'Materials / Equipment')),
  equipment_type      TEXT,
  contract_value_band TEXT CHECK (contract_value_band IN ('Under $1M', '$1–5M', '$5–20M', '$20M+')),
  signed_date         DATE NOT NULL,
  deal_type           TEXT,
  status              TEXT NOT NULL DEFAULT 'Signed' CHECK (status IN ('Signed', 'Amended', 'Expired')),
  notes               TEXT,
  file_url            TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contracts_supplier ON contracts(supplier_name);
CREATE INDEX idx_contracts_client ON contracts(client_name);
CREATE INDEX idx_contracts_type ON contracts(contract_type);

CREATE TABLE clause_records (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id             UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  clause_family           TEXT NOT NULL,
  clause_subtype          TEXT,
  supplier_proposed_value TEXT,
  final_signed_value      TEXT NOT NULL,
  client_preferred_value  TEXT,
  normalized_value        NUMERIC,
  normalized_unit         TEXT CHECK (normalized_unit IN ('days', '%', 'multiplier', 'score', 'months', 'currency')),
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clause_records_contract ON clause_records(contract_id);
CREATE INDEX idx_clause_records_family ON clause_records(clause_family);
