-- Default materials per template step (managed in Create template wizard).
-- psql -U postgres -d ProconixDB -f scripts/alter_qa_template_step_materials.sql

CREATE TABLE IF NOT EXISTS qa_template_step_materials (
  template_id        INTEGER NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  step_external_id   VARCHAR(120) NOT NULL,
  material_id        INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, step_external_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_qa_tpl_step_mat_template ON qa_template_step_materials(template_id);
CREATE INDEX IF NOT EXISTS idx_qa_tpl_step_mat_material ON qa_template_step_materials(material_id);
