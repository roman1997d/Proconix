-- Seed lookup data for Quality Assurance module.
-- Run after: create_qa_tables.sql
-- Example: psql -U postgres -d ProconixDB -f scripts/seed_qa_lookup.sql

INSERT INTO qa_worker_categories (code, label) VALUES
  ('fixers', 'Fixers'),
  ('plaster', 'Plaster'),
  ('electricians', 'Electricians'),
  ('painters', 'Painters')
ON CONFLICT (code) DO NOTHING;

INSERT INTO qa_cost_types (code, label) VALUES
  ('day', 'Day work'),
  ('hour', 'Hour work'),
  ('price', 'Price work')
ON CONFLICT (code) DO NOTHING;

INSERT INTO qa_job_statuses (code, label) VALUES
  ('new', 'New'),
  ('active', 'Active'),
  ('completed', 'Completed')
ON CONFLICT (code) DO NOTHING;

-- Global floors (project_id NULL) – insert only if not already present
INSERT INTO qa_floors (project_id, code, label, sort_order)
SELECT NULL, 'ground', 'Ground', 0
WHERE NOT EXISTS (SELECT 1 FROM qa_floors WHERE project_id IS NULL AND code = 'ground');
INSERT INTO qa_floors (project_id, code, label, sort_order)
SELECT NULL, '1', 'Floor 1', 1
WHERE NOT EXISTS (SELECT 1 FROM qa_floors WHERE project_id IS NULL AND code = '1');
INSERT INTO qa_floors (project_id, code, label, sort_order)
SELECT NULL, '2', 'Floor 2', 2
WHERE NOT EXISTS (SELECT 1 FROM qa_floors WHERE project_id IS NULL AND code = '2');
INSERT INTO qa_floors (project_id, code, label, sort_order)
SELECT NULL, '3', 'Floor 3', 3
WHERE NOT EXISTS (SELECT 1 FROM qa_floors WHERE project_id IS NULL AND code = '3');
