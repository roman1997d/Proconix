/**
 * Progress Drawings — weekly digital booking on general drawings.
 * Phase 1: bootstrap catalog from My Drawings (floor + Setting Out / GA).
 */

const { pool } = require('../db/pool');
const { ensureSchema: ensureMyDrawingsSchema } = require('./myDrawingsController');

const FLOORS = [
  { id: 'ground', label: 'Ground Floor' },
  { id: '1', label: 'Floor 1' },
  { id: '2', label: 'Floor 2' },
  { id: '3', label: 'Floor 3' },
  { id: '4', label: 'Floor 4' },
  { id: '5', label: 'Floor 5' },
];

const GENERAL_CATEGORY_RE = /^(setting\s*out|ga|general)$/i;

function isoDate(d) {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

function floorsForClient(floors) {
  if (!floors || !floors.length) return [];
  return floors.map(String);
}

function drawingOnFloor(floors, floorId) {
  if (!floors || !floors.length) return true;
  return floors.map(String).indexOf(String(floorId)) !== -1;
}

function isGeneralDrawing(d) {
  const cat = String(d.category || '').trim();
  if (GENERAL_CATEGORY_RE.test(cat)) return true;
  const hay = `${d.number || ''} ${d.title || ''}`.toLowerCase();
  return hay.includes('setting out') || /\bga[- ]?\d/i.test(hay) || hay.includes(' general ');
}

async function ensureSchemaInner() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS progress_work_types (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      colour TEXT NOT NULL DEFAULT '#ef4444',
      pattern TEXT NOT NULL DEFAULT 'diagonal',
      supports_layers BOOLEAN NOT NULL DEFAULT false,
      active BOOLEAN NOT NULL DEFAULT true,
      sort_order INT NOT NULL DEFAULT 0,
      CONSTRAINT uq_progress_work_types_name UNIQUE (name)
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS progress_bookings (
      id SERIAL PRIMARY KEY,
      workspace_id INT,
      project_name TEXT NOT NULL DEFAULT '',
      floor_id TEXT NOT NULL,
      drawing_id INT,
      drawing_number TEXT NOT NULL DEFAULT '',
      drawing_revision TEXT NOT NULL DEFAULT '',
      week_number INT,
      week_commencing DATE,
      prepared_by TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      pdf_path TEXT,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS progress_locations (
      id SERIAL PRIMARY KEY,
      booking_id INT NOT NULL REFERENCES progress_bookings(id) ON DELETE CASCADE,
      page_index INT NOT NULL DEFAULT 0,
      x DOUBLE PRECISION NOT NULL,
      y DOUBLE PRECISION NOT NULL,
      width DOUBLE PRECISION NOT NULL,
      height DOUBLE PRECISION NOT NULL,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS progress_annotations (
      id SERIAL PRIMARY KEY,
      location_id INT NOT NULL REFERENCES progress_locations(id) ON DELETE CASCADE,
      work_type_id INT NOT NULL REFERENCES progress_work_types(id),
      layer_count INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_progress_bookings_floor ON progress_bookings(floor_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_progress_locations_booking ON progress_locations(booking_id)`);

  const seeded = await pool.query('SELECT id FROM progress_work_types LIMIT 1');
  if (!seeded.rows[0]) {
    await pool.query(
      `INSERT INTO progress_work_types (name, colour, pattern, supports_layers, sort_order) VALUES
        ('Boarding', '#ef4444', 'diagonal', true, 0),
        ('Insulation', '#eab308', 'cross', false, 1),
        ('Metal', '#111827', 'hatch', false, 2),
        ('Tape & Joint', '#3b82f6', 'lines', false, 3)`
    );
  }
}

let schemaPromise = null;
function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = ensureMyDrawingsSchema()
      .then(() => ensureSchemaInner())
      .catch((err) => {
        schemaPromise = null;
        throw err;
      });
  }
  return schemaPromise;
}

async function loadMyDrawingsCatalog(workspaceId) {
  const ws = await pool.query('SELECT id, name FROM my_drawings_workspace WHERE id = $1', [workspaceId]);
  if (!ws.rows[0]) return null;
  const cats = await pool.query(
    'SELECT id, name FROM my_drawings_category WHERE workspace_id = $1 ORDER BY sort_order ASC, name ASC',
    [workspaceId]
  );
  const items = await pool.query(
    `SELECT i.id, i.number, i.title, i.revision, i.size_bytes, i.updated_at, i.floors, c.name AS category
     FROM my_drawings_item i
     LEFT JOIN my_drawings_category c ON c.id = i.category_id
     WHERE i.workspace_id = $1
     ORDER BY i.number ASC`,
    [workspaceId]
  );
  return {
    project: { id: `ws-${ws.rows[0].id}`, name: ws.rows[0].name || 'My Drawings' },
    categories: cats.rows.map((r) => r.name),
    drawings: items.rows.map((d) => ({
      id: String(d.id),
      number: d.number,
      title: d.title,
      category: d.category || 'Uncategorised',
      revision: d.revision,
      floors: floorsForClient(d.floors),
      updatedAt: isoDate(d.updated_at),
      sizeBytes: Number(d.size_bytes) || 0,
      fileUrl: `/api/my-drawings/drawings/${d.id}/file`,
    })),
  };
}

async function listBookingsForFloor(floorId) {
  const rows = await pool.query(
    `SELECT id, project_name, floor_id, drawing_number, drawing_revision,
            week_number, week_commencing, prepared_by, status, created_at
     FROM progress_bookings
     WHERE floor_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [String(floorId)]
  );
  return rows.rows.map((r) => ({
    id: String(r.id),
    projectName: r.project_name,
    floorId: r.floor_id,
    drawingNumber: r.drawing_number,
    drawingRevision: r.drawing_revision,
    weekNumber: r.week_number,
    weekCommencing: r.week_commencing ? isoDate(r.week_commencing) : null,
    preparedBy: r.prepared_by,
    status: r.status,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  }));
}

/** GET /api/progress-drawings/bootstrap?floor=ground */
async function getBootstrap(req, res) {
  try {
    await ensureSchema();
    const workspace = req.myDrawings && req.myDrawings.workspace;
    if (!workspace) {
      return res.status(401).json({ success: false, message: 'Sign in required.' });
    }
    const catalog = await loadMyDrawingsCatalog(workspace.id);
    if (!catalog) {
      return res.status(404).json({ success: false, message: 'Workspace not found.' });
    }

    const floorId = String((req.query && req.query.floor) || '').trim() || null;
    let drawings = catalog.drawings.filter(isGeneralDrawing);
    if (!drawings.length) {
      /* Fallback so empty filter does not block MVP testing */
      drawings = catalog.drawings.slice();
    }
    if (floorId) {
      drawings = drawings.filter((d) => drawingOnFloor(d.floors, floorId));
    }

    const workTypes = await pool.query(
      `SELECT id, name, colour, pattern, supports_layers, sort_order
       FROM progress_work_types
       WHERE active = true
       ORDER BY sort_order ASC, name ASC`
    );

    const bookings = floorId ? await listBookingsForFloor(floorId) : [];

    return res.json({
      success: true,
      role: req.myDrawings.role || 'worker',
      project: catalog.project,
      floors: FLOORS,
      floorId,
      categories: catalog.categories,
      drawings,
      bookings,
      workTypes: workTypes.rows.map((w) => ({
        id: String(w.id),
        name: w.name,
        colour: w.colour,
        pattern: w.pattern,
        supportsLayers: !!w.supports_layers,
        sortOrder: w.sort_order,
      })),
      generalOnly: drawings.length > 0 && drawings.every(isGeneralDrawing),
    });
  } catch (err) {
    console.error('progressDrawings getBootstrap:', err);
    return res.status(500).json({ success: false, message: 'Could not load Progress Drawings.' });
  }
}

module.exports = {
  ensureSchema,
  getBootstrap,
};
