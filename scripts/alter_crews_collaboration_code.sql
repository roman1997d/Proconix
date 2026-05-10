-- Lifetime collaboration code per crew (same format as work-entry codes: XXXX-XXXX).
-- Run: psql … -f scripts/alter_crews_collaboration_code.sql

ALTER TABLE crews ADD COLUMN IF NOT EXISTS collaboration_code VARCHAR(9);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crews_collaboration_code
  ON crews (collaboration_code)
  WHERE collaboration_code IS NOT NULL;

COMMENT ON COLUMN crews.collaboration_code IS 'Permanent code operatives enter in Work entry collaboration field to credit all crew members on the same project.';
