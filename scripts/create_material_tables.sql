-- Material Management: categories, suppliers, materials (per company/project).
-- Run: psql -U postgres -d ProconixDB -f scripts/create_material_tables.sql
-- Requires: companies, projects, manager tables.

-- 1. Categories (per company)
CREATE TABLE IF NOT EXISTS material_categories (
  id                SERIAL PRIMARY KEY,
  company_id        INT NOT NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id     INT NOT NULL,
  created_by_name   VARCHAR(255) NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id     INT,
  updated_by_name   VARCHAR(255),
  deleted_at        TIMESTAMPTZ,
  deleted_by_id     INT,
  deleted_by_name   VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_material_categories_company ON material_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_material_categories_company_deleted ON material_categories(company_id, deleted_at);

-- 2. Suppliers (per company)
CREATE TABLE IF NOT EXISTS material_suppliers (
  id                SERIAL PRIMARY KEY,
  company_id        INT NOT NULL,
  name              VARCHAR(255) NOT NULL,
  contact           VARCHAR(255),
  email_phone       VARCHAR(255),
  address           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id     INT NOT NULL,
  created_by_name   VARCHAR(255) NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id     INT,
  updated_by_name   VARCHAR(255),
  deleted_at        TIMESTAMPTZ,
  deleted_by_id     INT,
  deleted_by_name   VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_material_suppliers_company ON material_suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_material_suppliers_company_deleted ON material_suppliers(company_id, deleted_at);

-- 3. Materials (per project; category/supplier optional)
CREATE TABLE IF NOT EXISTS materials (
  id                  SERIAL PRIMARY KEY,
  project_id           INT NOT NULL,
  company_id          INT NOT NULL,
  name                VARCHAR(255) NOT NULL,
  category_id         INT,
  supplier_id         INT,
  unit                VARCHAR(50) NOT NULL DEFAULT 'kg',
  quantity_initial    NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantity_initial >= 0),
  quantity_used       NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantity_used >= 0),
  quantity_remaining  NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0),
  low_stock_threshold NUMERIC(18,4) CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','low','out')),
  email_notify        BOOLEAN NOT NULL DEFAULT FALSE,
  unit_coverage           NUMERIC(18,4) CHECK (unit_coverage IS NULL OR unit_coverage >= 0),
  consumption_calc_type   VARCHAR(32),
  consumption_value       NUMERIC(18,6),
  waste_factor_pct        NUMERIC(8,4) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id       INT NOT NULL,
  created_by_name     VARCHAR(255) NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id       INT,
  updated_by_name     VARCHAR(255),
  deleted_at          TIMESTAMPTZ,
  deleted_by_id       INT,
  deleted_by_name     VARCHAR(255),
  CONSTRAINT fk_materials_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_materials_category FOREIGN KEY (category_id) REFERENCES material_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_materials_supplier FOREIGN KEY (supplier_id) REFERENCES material_suppliers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_project_deleted ON materials(project_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_materials_company_deleted ON materials(company_id, deleted_at);
