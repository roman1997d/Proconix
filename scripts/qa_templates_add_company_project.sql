-- Add company_id and project_id to qa_templates so templates are scoped per company and project.
-- Run once: psql -U postgres -d ProconixDB -f scripts/qa_templates_add_company_project.sql

ALTER TABLE qa_templates ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE qa_templates ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_qa_templates_company_id ON qa_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_qa_templates_project_id ON qa_templates(project_id);

-- Optional: backfill existing rows (set to first company / first project of that company if you have data)
-- UPDATE qa_templates t SET company_id = (SELECT id FROM companies LIMIT 1), project_id = (SELECT id FROM projects WHERE company_id = (SELECT id FROM companies LIMIT 1) LIMIT 1) WHERE t.company_id IS NULL;
