-- QA Material Auto Calculation Engine + Material Management consumption rules
-- psql -U postgres -d ProconixDB -f scripts/alter_qa_material_auto_calc_engine.sql

-- Materials: consumption rules (template only selects materials; formulas live here)
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS consumption_calc_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS consumption_value NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS waste_factor_pct NUMERIC(8,4) NOT NULL DEFAULT 0;

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_consumption_calc_type_chk;
ALTER TABLE materials ADD CONSTRAINT materials_consumption_calc_type_chk CHECK (
  consumption_calc_type IS NULL
  OR consumption_calc_type IN ('AREA_BASED', 'LENGTH_BASED', 'COVERAGE_BASED', 'MULTIPLIER_BASED')
);

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_consumption_value_chk;
ALTER TABLE materials ADD CONSTRAINT materials_consumption_value_chk CHECK (
  consumption_value IS NULL OR consumption_value >= 0
);

ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_waste_factor_pct_chk;
ALTER TABLE materials ADD CONSTRAINT materials_waste_factor_pct_chk CHECK (
  waste_factor_pct >= 0 AND waste_factor_pct <= 1000
);

-- Template-level waste (optional), applied on top of per-material waste
ALTER TABLE qa_templates
  ADD COLUMN IF NOT EXISTS waste_factor_pct NUMERIC(8,4) NOT NULL DEFAULT 0;

ALTER TABLE qa_templates DROP CONSTRAINT IF EXISTS qa_templates_waste_factor_pct_chk;
ALTER TABLE qa_templates ADD CONSTRAINT qa_templates_waste_factor_pct_chk CHECK (
  waste_factor_pct >= 0 AND waste_factor_pct <= 1000
);

-- Persisted computed requirements per QA job (after create / when materials or quantities change)
CREATE TABLE IF NOT EXISTS qa_job_material_requirements (
  id                    SERIAL PRIMARY KEY,
  job_id                INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  material_id           INT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity_required     NUMERIC(18,4) NOT NULL,
  unit                  VARCHAR(50) NOT NULL,
  calculation_type      VARCHAR(32),
  waste_material_pct    NUMERIC(8,4) NOT NULL DEFAULT 0,
  waste_template_pct    NUMERIC(8,4) NOT NULL DEFAULT 0,
  raw_quantity_sum      NUMERIC(18,6),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_qa_job_mat_req_job ON qa_job_material_requirements(job_id);
CREATE INDEX IF NOT EXISTS idx_qa_job_mat_req_material ON qa_job_material_requirements(material_id);
