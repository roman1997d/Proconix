-- Seed a few work logs for testing. Replace 1 with your company_id if needed.
-- Run: psql -U postgres -d ProconixDB -f scripts/seed_work_logs.sql

INSERT INTO work_logs (
  company_id, job_display_id, worker_name, project, block, floor, apartment, zone,
  work_type, quantity, unit_price, total, status, description, photo_urls, work_was_edited, edit_history
) VALUES
  (1, 'WL-001', 'John Jones', 'Site Alpha', 'A', '1', '101', 'North', 'Plastering', 25, 12.50, 312.50, 'pending', 'Ceiling plaster finish in living room.', '["https://picsum.photos/400/300?random=1"]', false, '[]'),
  (1, 'WL-002', 'John Jones', 'Site Alpha', 'A', '2', '205', 'North', 'Drylining', 40, 8.00, 320.00, 'approved', 'Drywall installation corridor.', '["https://picsum.photos/400/300?random=2"]', false, '[]'),
  (1, 'WL-003', 'Jane Smith', 'Site Beta', 'B', '0', 'Ground', 'East', 'Painting', 120, 3.50, 420.00, 'edited', 'Full repaint two bedrooms.', '[]', true, '[{"field":"quantity","oldVal":100,"newVal":120,"editor":"Manager","at":"2026-02-13T12:00:00.000Z"}]'),
  (1, 'WL-004', 'Jane Smith', 'Site Beta', 'B', '1', '108', 'East', 'Electricity', 1, 185.00, 185.00, 'waiting_worker', 'Consumer unit check and certification.', '[]', true, '[]'),
  (1, 'WL-005', 'Mike Brown', 'Site Alpha', 'A', '1', '102', 'South', 'Plumbing', 2, 95.00, 190.00, 'pending', 'Radiator replacement x2.', '[]', false, '[]')
ON CONFLICT (company_id, job_display_id) DO NOTHING;
