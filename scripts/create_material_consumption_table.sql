-- Material consumption: daily snapshot of quantity_remaining per material (for forecast).
-- Run: psql -U postgres -d ProconixDB -f scripts/create_material_consumption_table.sql
-- Requires: materials table.

CREATE TABLE IF NOT EXISTS material_consumption (
  id                 SERIAL PRIMARY KEY,
  material_id        INT NOT NULL,
  project_id         INT NOT NULL,
  company_id         INT NOT NULL,
  snapshot_date      DATE NOT NULL,
  quantity_remaining NUMERIC(18,4) NOT NULL,
  recorded_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_material_consumption_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
  CONSTRAINT uq_material_consumption_material_date UNIQUE (material_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_material_consumption_project_date ON material_consumption(project_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_material_consumption_company_date ON material_consumption(company_id, snapshot_date);
