-- Optional: how much of the stock unit one pack/item represents (e.g. m² per pack when unit is m²).
-- Run after create_material_tables.sql if the table already exists without this column:
--   psql -U postgres -d ProconixDB -f scripts/alter_materials_add_unit_coverage.sql

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS unit_coverage NUMERIC(18,4) CHECK (unit_coverage IS NULL OR unit_coverage >= 0);
