-- Verifică ce tabele există în schema public față de lista Proconix.
-- Rulează: psql -U postgres -d ProconixDB -f scripts/verify_database_tables.sql
-- sau: bash scripts/verify_db_tables.sh  (din rădăcina proiectului, cu .env)

\echo ''
\echo '========== CORE (înregistrare, manager, operativ, work logs, task-uri) =========='
WITH expected(name, tier) AS (
  VALUES
    ('companies', 1),
    ('manager', 1),
    ('users', 1),
    ('projects', 1),
    ('project_assignments', 1),
    ('work_logs', 1),
    ('work_hours', 1),
    ('tasks', 1),
    ('issues', 1),
    ('uploads', 1),
    ('planning_plans', 1),
    ('planning_plan_tasks', 1),
    ('operative_task_photos', 1),
    ('proconix_admin', 1)
),
actual AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
)
SELECT e.name AS table_name,
       CASE WHEN a.table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM expected e
LEFT JOIN actual a ON a.table_name = e.name
ORDER BY (CASE WHEN a.table_name IS NULL THEN 0 ELSE 1 END), e.name;

\echo ''
\echo '========== MATERIAL MANAGEMENT =========='
WITH expected(name) AS (
  VALUES
    ('material_categories'),
    ('material_suppliers'),
    ('materials'),
    ('material_consumption')
),
actual AS (
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
)
SELECT e.name AS table_name,
       CASE WHEN a.table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM expected e
LEFT JOIN actual a ON a.table_name = e.name
ORDER BY (CASE WHEN a.table_name IS NULL THEN 0 ELSE 1 END), e.name;

\echo ''
\echo '========== QUALITY ASSURANCE =========='
WITH expected(name) AS (
  VALUES
    ('qa_worker_categories'),
    ('qa_cost_types'),
    ('qa_job_statuses'),
    ('qa_floors'),
    ('qa_supervisors'),
    ('qa_workers'),
    ('qa_templates'),
    ('qa_template_steps'),
    ('qa_jobs'),
    ('qa_job_templates'),
    ('qa_job_workers')
),
actual AS (
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
)
SELECT e.name AS table_name,
       CASE WHEN a.table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM expected e
LEFT JOIN actual a ON a.table_name = e.name
ORDER BY (CASE WHEN a.table_name IS NULL THEN 0 ELSE 1 END), e.name;

\echo ''
\echo '========== SITE SNAGS (dacă ai rulat create_site_snags*.sql) =========='
WITH expected(name) AS (
  VALUES
    ('site_snag_prefs'),
    ('site_snag_drawings'),
    ('site_snags'),
    ('site_snag_measurements'),
    ('site_snag_highlights'),
    ('site_snag_custom_category'),
    ('site_snag_removed_preset')
),
actual AS (
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
)
SELECT e.name AS table_name,
       CASE WHEN a.table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM expected e
LEFT JOIN actual a ON a.table_name = e.name
ORDER BY (CASE WHEN a.table_name IS NULL THEN 0 ELSE 1 END), e.name;

\echo ''
\echo '========== REZUMAT (toate tabelele din lista de mai sus, pe grupe) =========='
WITH all_expected(name) AS (
  SELECT name FROM (VALUES
    ('companies'), ('manager'), ('users'), ('projects'), ('project_assignments'),
    ('work_logs'), ('work_hours'), ('tasks'), ('issues'), ('uploads'),
    ('planning_plans'), ('planning_plan_tasks'), ('operative_task_photos'), ('proconix_admin'),
    ('material_categories'), ('material_suppliers'), ('materials'), ('material_consumption'),
    ('qa_worker_categories'), ('qa_cost_types'), ('qa_job_statuses'), ('qa_floors'),
    ('qa_supervisors'), ('qa_workers'), ('qa_templates'), ('qa_template_steps'),
    ('qa_jobs'), ('qa_job_templates'), ('qa_job_workers'),
    ('site_snag_prefs'), ('site_snag_drawings'), ('site_snags'), ('site_snag_measurements'),
    ('site_snag_highlights'), ('site_snag_custom_category'), ('site_snag_removed_preset')
  ) AS t(name)
),
actual AS (
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
)
SELECT
  COUNT(*) AS total_expected,
  COUNT(a.table_name) AS present,
  COUNT(*) - COUNT(a.table_name) AS missing
FROM all_expected e
LEFT JOIN actual a ON a.table_name = e.name;

\echo ''
\echo '========== TABELE EXTRA în public (nu sunt în lista verificată) =========='
SELECT t.table_name
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT IN (
    'companies', 'manager', 'users', 'projects', 'project_assignments',
    'work_logs', 'work_hours', 'tasks', 'issues', 'uploads',
    'planning_plans', 'planning_plan_tasks', 'operative_task_photos', 'proconix_admin',
    'material_categories', 'material_suppliers', 'materials', 'material_consumption',
    'qa_worker_categories', 'qa_cost_types', 'qa_job_statuses', 'qa_floors',
    'qa_supervisors', 'qa_workers', 'qa_templates', 'qa_template_steps',
    'qa_jobs', 'qa_job_templates', 'qa_job_workers',
    'site_snag_prefs', 'site_snag_drawings', 'site_snags', 'site_snag_measurements',
    'site_snag_highlights', 'site_snag_custom_category', 'site_snag_removed_preset'
  )
ORDER BY t.table_name;
