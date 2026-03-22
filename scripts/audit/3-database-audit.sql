-- 3️⃣ Audit baze de date PostgreSQL – Proconix
-- Rulează: psql -U postgres -d ProconixDB -f scripts/audit/3-database-audit.sql

\echo '=============================================='
\echo '3️⃣  AUDIT BAZE DE DATE'
\echo '=============================================='

\echo ''
\echo '--- Toate tabelele (public) ---'
\dt public.*

\echo ''
\echo '--- Utilizare tabele: seq_scan vs idx_scan (tabele cu multe seq_scan = candidati la indexuri) ---'
SELECT
  schemaname,
  relname AS table_name,
  seq_scan,
  idx_scan,
  n_live_tup AS row_estimate,
  CASE WHEN (seq_scan + idx_scan) > 0
    THEN round(100.0 * seq_scan / (seq_scan + idx_scan), 1)
    ELSE 0
  END AS pct_seq_scan
FROM pg_stat_user_tables
ORDER BY seq_scan DESC;

\echo ''
\echo '--- Indexuri per tabel ---'
SELECT
  t.relname AS table_name,
  i.relname AS index_name,
  a.attname AS column_name
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) AND a.attisdropped = false
WHERE t.relkind = 'r'
  AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY t.relname, i.relname;

\echo ''
\echo '--- Tabele cu foarte multe seq_scan (candidati la index suplimentar) ---'
SELECT relname AS table_name, seq_scan, idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > 10
ORDER BY seq_scan DESC;

\echo ''
\echo '--- Sfârșit audit DB. Tabele nefolosite: verifică manual în aplicație dacă sunt referite. ---'
