-- Per-template-step quantities for QA jobs (m² / linear m / units per step key "templateId:stepId").
-- Run on existing databases after other qa_jobs migrations.

ALTER TABLE qa_jobs ADD COLUMN IF NOT EXISTS step_quantities JSONB DEFAULT NULL;

COMMENT ON COLUMN qa_jobs.step_quantities IS 'JSON map: { "templateId:stepId": { "m2","linear","units" } }';
