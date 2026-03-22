-- Remove Material Management tables (run once).
-- Order: drop tables that reference others first.
DROP TABLE IF EXISTS material_logs;
DROP TABLE IF EXISTS materials;
DROP TABLE IF EXISTS material_categories;
DROP TABLE IF EXISTS suppliers;
