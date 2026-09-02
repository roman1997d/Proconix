/**
 * Progress Drawings — weekly digital booking on general drawings.
 * Phase 1: bootstrap catalog from My Drawings (floor + Setting Out / GA).
 */

const { pool } = require('../db/pool');
const { ensureSchema: ensureMyDrawingsSchema } = require('./myDrawingsController');
const { buildProgressDrawingPdf } = require('../lib/buildProgressDrawingPdf');
const { sendProgressDrawingEmail } = require('../lib/sendCallbackRequestEmail');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    ALTER TABLE progress_locations
    ADD COLUMN IF NOT EXISTS mark_kind TEXT NOT NULL DEFAULT 'rect'
  `);

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

  await syncProgressWorkTypes();
}

/** Canonical work-type legend for Progress Drawings (name → colour + hatch). */
const PROGRESS_WORK_TYPES = [
  { name: 'PlasterBoard', colour: '#2563eb', pattern: 'solid', supportsLayers: false, sortOrder: 0 },
  { name: 'Insulation', colour: '#eab308', pattern: 'solid', supportsLayers: false, sortOrder: 1 },
  { name: 'Metal', colour: '#111827', pattern: 'solid', supportsLayers: false, sortOrder: 2 },
  { name: 'Angle & Insulation', colour: '#16a34a', pattern: 'solid', supportsLayers: false, sortOrder: 3 },
  { name: 'Patress', colour: '#a855f7', pattern: 'solid', supportsLayers: false, sortOrder: 4 },
  { name: 'Letterbox', colour: '#ef4444', pattern: 'solid', supportsLayers: false, sortOrder: 5 }
];

async function syncProgressWorkTypes() {
  /* Rename legacy Tape & Joint so existing annotations keep their work_type_id. */
  await pool.query(
    `UPDATE progress_work_types
     SET name = 'Angle & Insulation'
     WHERE name = 'Tape & Joint'
       AND NOT EXISTS (SELECT 1 FROM progress_work_types WHERE name = 'Angle & Insulation')`
  );

  await pool.query(
    `UPDATE progress_work_types
     SET name = 'PlasterBoard'
     WHERE name = 'Boarding'
       AND NOT EXISTS (SELECT 1 FROM progress_work_types WHERE name = 'PlasterBoard')`
  );

  for (const wt of PROGRESS_WORK_TYPES) {
    const existing = await pool.query(
      'SELECT id FROM progress_work_types WHERE name = $1 LIMIT 1',
      [wt.name]
    );
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE progress_work_types
         SET colour = $2, pattern = $3, supports_layers = $4, sort_order = $5, active = true
         WHERE id = $1`,
        [existing.rows[0].id, wt.colour, wt.pattern, wt.supportsLayers, wt.sortOrder]
      );
    } else {
      await pool.query(
        `INSERT INTO progress_work_types (name, colour, pattern, supports_layers, sort_order, active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [wt.name, wt.colour, wt.pattern, wt.supportsLayers, wt.sortOrder]
      );
    }
  }

  /* Hide any leftover types that are not in the canonical legend. */
  const keep = PROGRESS_WORK_TYPES.map((w) => w.name);
  await pool.query(
    `UPDATE progress_work_types
     SET active = false
     WHERE name <> ALL($1::text[])`,
    [keep]
  );
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

function actorName(req) {
  const w = req.myDrawings && req.myDrawings.worker;
  if (w) {
    const name = [w.firstName, w.lastName].filter(Boolean).join(' ').trim();
    return name || w.email || 'Worker';
  }
  if (req.myDrawings && req.myDrawings.role === 'admin') return 'Admin';
  return 'User';
}

function mapAnnotation(row) {
  return {
    id: String(row.id),
    workTypeId: String(row.work_type_id),
    workTypeName: row.work_type_name,
    colour: row.colour,
    pattern: row.pattern,
    supportsLayers: !!row.supports_layers,
    layerCount: Number(row.layer_count) || 1,
  };
}

function mapLocation(row, annotations) {
  return {
    id: String(row.id),
    pageIndex: Number(row.page_index) || 0,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    markKind: row.mark_kind === 'line' ? 'line' : 'rect',
    createdBy: row.created_by || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    annotations: annotations || [],
  };
}

function isValidMarkCoords(x, y, width, height, markKind) {
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return false;
  if (markKind === 'line') {
    return Math.sqrt((width * width) + (height * height)) >= 1;
  }
  return width > 0 && height > 0;
}

async function loadBookingDetail(bookingId) {
  const booking = await pool.query(
    `SELECT id, workspace_id, project_name, floor_id, drawing_id, drawing_number, drawing_revision,
            week_number, week_commencing, prepared_by, notes, status, pdf_path, created_by, created_at, updated_at
     FROM progress_bookings WHERE id = $1`,
    [bookingId]
  );
  if (!booking.rows[0]) return null;
  const b = booking.rows[0];
  const locs = await pool.query(
    `SELECT id, page_index, x, y, width, height, mark_kind, created_by, created_at
     FROM progress_locations WHERE booking_id = $1 ORDER BY id ASC`,
    [bookingId]
  );
  const byLoc = {};
  if (locs.rows.length) {
    const ann = await pool.query(
      `SELECT a.id, a.location_id, a.work_type_id, a.layer_count,
              w.name AS work_type_name, w.colour, w.pattern, w.supports_layers
       FROM progress_annotations a
       JOIN progress_work_types w ON w.id = a.work_type_id
       WHERE a.location_id = ANY($1::int[])
       ORDER BY a.id ASC`,
      [locs.rows.map((r) => r.id)]
    );
    ann.rows.forEach((row) => {
      const key = String(row.location_id);
      if (!byLoc[key]) byLoc[key] = [];
      byLoc[key].push(mapAnnotation(row));
    });
  }
  return {
    id: String(b.id),
    projectName: b.project_name,
    floorId: b.floor_id,
    drawingId: b.drawing_id != null ? String(b.drawing_id) : null,
    drawingNumber: b.drawing_number,
    drawingRevision: b.drawing_revision,
    weekNumber: b.week_number,
    weekCommencing: b.week_commencing ? isoDate(b.week_commencing) : null,
    preparedBy: b.prepared_by,
    notes: b.notes || '',
    status: b.status,
    pdfPath: b.pdf_path,
    createdBy: b.created_by,
    createdAt: b.created_at ? new Date(b.created_at).toISOString() : null,
    updatedAt: b.updated_at ? new Date(b.updated_at).toISOString() : null,
    locations: locs.rows.map((row) => mapLocation(row, byLoc[String(row.id)] || [])),
  };
}

async function assertDraftBooking(req, bookingId) {
  const row = await pool.query(
    'SELECT id, workspace_id, status FROM progress_bookings WHERE id = $1',
    [bookingId]
  );
  if (!row.rows[0]) return { error: { status: 404, message: 'Booking not found.' } };
  if (Number(row.rows[0].workspace_id) !== Number(req.myDrawings.workspace.id)) {
    return { error: { status: 403, message: 'Booking not in this workspace.' } };
  }
  if (row.rows[0].status !== 'draft') {
    return { error: { status: 400, message: 'Only draft bookings can be edited.' } };
  }
  return { booking: row.rows[0] };
}

/** POST /bookings — create or resume draft for floor + drawing */
async function createOrGetDraft(req, res) {
  try {
    await ensureSchema();
    const workspace = req.myDrawings.workspace;
    const floorId = String((req.body && req.body.floorId) || '').trim();
    const drawingId = parseInt((req.body && req.body.drawingId), 10);
    if (!floorId || !drawingId) {
      return res.status(400).json({ success: false, message: 'floorId and drawingId are required.' });
    }
    const drawing = await pool.query(
      `SELECT i.id, i.number, i.title, i.revision
       FROM my_drawings_item i
       WHERE i.id = $1 AND i.workspace_id = $2`,
      [drawingId, workspace.id]
    );
    if (!drawing.rows[0]) {
      return res.status(404).json({ success: false, message: 'Drawing not found.' });
    }
    const existing = await pool.query(
      `SELECT id FROM progress_bookings
       WHERE workspace_id = $1 AND floor_id = $2 AND drawing_id = $3 AND status = 'draft'
       ORDER BY updated_at DESC LIMIT 1`,
      [workspace.id, floorId, drawingId]
    );
    let bookingId;
    if (existing.rows[0]) {
      bookingId = existing.rows[0].id;
    } else {
      const inserted = await pool.query(
        `INSERT INTO progress_bookings
          (workspace_id, project_name, floor_id, drawing_id, drawing_number, drawing_revision,
           prepared_by, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 'draft')
         RETURNING id`,
        [
          workspace.id,
          workspace.name || 'My Drawings',
          floorId,
          drawingId,
          drawing.rows[0].number,
          drawing.rows[0].revision || '',
          actorName(req),
        ]
      );
      bookingId = inserted.rows[0].id;
    }
    const detail = await loadBookingDetail(bookingId);
    return res.json({ success: true, booking: detail });
  } catch (err) {
    console.error('progressDrawings createOrGetDraft:', err);
    return res.status(500).json({ success: false, message: 'Could not open draft booking.' });
  }
}

/** GET /bookings/:id */
async function getBooking(req, res) {
  try {
    await ensureSchema();
    const id = parseInt(req.params.id, 10);
    const wsCheck = await pool.query('SELECT workspace_id FROM progress_bookings WHERE id = $1', [id]);
    if (!wsCheck.rows[0]) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (Number(wsCheck.rows[0].workspace_id) !== Number(req.myDrawings.workspace.id)) {
      return res.status(403).json({ success: false, message: 'Booking not in this workspace.' });
    }
    const detail = await loadBookingDetail(id);
    return res.json({ success: true, booking: detail });
  } catch (err) {
    console.error('progressDrawings getBooking:', err);
    return res.status(500).json({ success: false, message: 'Could not load booking.' });
  }
}

async function replaceAnnotations(client, locationId, annotations) {
  await client.query('DELETE FROM progress_annotations WHERE location_id = $1', [locationId]);
  for (let i = 0; i < annotations.length; i++) {
    const a = annotations[i];
    const workTypeId = parseInt(a.workTypeId, 10);
    const layerCount = Math.max(1, Math.min(5, parseInt(a.layerCount, 10) || 1));
    if (!workTypeId) continue;
    const wt = await client.query(
      'SELECT id, supports_layers FROM progress_work_types WHERE id = $1 AND active = true',
      [workTypeId]
    );
    if (!wt.rows[0]) continue;
    const layers = wt.rows[0].supports_layers ? layerCount : 1;
    await client.query(
      `INSERT INTO progress_annotations (location_id, work_type_id, layer_count)
       VALUES ($1, $2, $3)`,
      [locationId, workTypeId, layers]
    );
  }
}

/** POST /bookings/:id/locations */
async function addLocation(req, res) {
  const client = await pool.connect();
  try {
    await ensureSchema();
    const bookingId = parseInt(req.params.id, 10);
    const check = await assertDraftBooking(req, bookingId);
    if (check.error) return res.status(check.error.status).json({ success: false, message: check.error.message });

    const x = Number(req.body && req.body.x);
    const y = Number(req.body && req.body.y);
    const width = Number(req.body && req.body.width);
    const height = Number(req.body && req.body.height);
    const markKind = String((req.body && req.body.markKind) || 'line') === 'rect' ? 'rect' : 'line';
    const pageIndex = Math.max(0, parseInt((req.body && req.body.pageIndex), 10) || 0);
    const annotations = Array.isArray(req.body && req.body.annotations) ? req.body.annotations : [];
    if (!isValidMarkCoords(x, y, width, height, markKind)) {
      return res.status(400).json({ success: false, message: 'Valid mark coordinates are required.' });
    }
    if (!annotations.length) {
      return res.status(400).json({ success: false, message: 'At least one work type is required.' });
    }

    await client.query('BEGIN');
    const loc = await client.query(
      `INSERT INTO progress_locations (booking_id, page_index, x, y, width, height, mark_kind, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [bookingId, pageIndex, x, y, width, height, markKind, actorName(req)]
    );
    await replaceAnnotations(client, loc.rows[0].id, annotations);
    await client.query('UPDATE progress_bookings SET updated_at = NOW() WHERE id = $1', [bookingId]);
    await client.query('COMMIT');
    const detail = await loadBookingDetail(bookingId);
    return res.json({ success: true, booking: detail, locationId: String(loc.rows[0].id) });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('progressDrawings addLocation:', err);
    return res.status(500).json({ success: false, message: 'Could not save location.' });
  } finally {
    client.release();
  }
}

/** PUT /locations/:id */
async function updateLocation(req, res) {
  const client = await pool.connect();
  try {
    await ensureSchema();
    const locationId = parseInt(req.params.id, 10);
    const loc = await pool.query(
      `SELECT l.id, l.booking_id FROM progress_locations l WHERE l.id = $1`,
      [locationId]
    );
    if (!loc.rows[0]) return res.status(404).json({ success: false, message: 'Location not found.' });
    const check = await assertDraftBooking(req, loc.rows[0].booking_id);
    if (check.error) return res.status(check.error.status).json({ success: false, message: check.error.message });

    const body = req.body || {};
    await client.query('BEGIN');
    if (body.x != null || body.y != null || body.width != null || body.height != null ||
        body.pageIndex != null || body.markKind != null) {
      const cur = await client.query(
        'SELECT page_index, x, y, width, height, mark_kind FROM progress_locations WHERE id = $1',
        [locationId]
      );
      const c = cur.rows[0];
      const x = body.x != null ? Number(body.x) : Number(c.x);
      const y = body.y != null ? Number(body.y) : Number(c.y);
      const width = body.width != null ? Number(body.width) : Number(c.width);
      const height = body.height != null ? Number(body.height) : Number(c.height);
      const markKind = body.markKind != null
        ? (String(body.markKind) === 'rect' ? 'rect' : 'line')
        : (c.mark_kind === 'line' ? 'line' : 'rect');
      const pageIndex = body.pageIndex != null ? Math.max(0, parseInt(body.pageIndex, 10) || 0) : c.page_index;
      if (!isValidMarkCoords(x, y, width, height, markKind)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Valid mark coordinates are required.' });
      }
      await client.query(
        `UPDATE progress_locations
         SET page_index = $1, x = $2, y = $3, width = $4, height = $5, mark_kind = $6, updated_at = NOW()
         WHERE id = $7`,
        [pageIndex, x, y, width, height, markKind, locationId]
      );
    }
    if (Array.isArray(body.annotations)) {
      if (!body.annotations.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'At least one work type is required.' });
      }
      await replaceAnnotations(client, locationId, body.annotations);
    }
    await client.query('UPDATE progress_bookings SET updated_at = NOW() WHERE id = $1', [loc.rows[0].booking_id]);
    await client.query('COMMIT');
    const detail = await loadBookingDetail(loc.rows[0].booking_id);
    return res.json({ success: true, booking: detail });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('progressDrawings updateLocation:', err);
    return res.status(500).json({ success: false, message: 'Could not update location.' });
  } finally {
    client.release();
  }
}

/** DELETE /locations/:id */
async function deleteLocation(req, res) {
  try {
    await ensureSchema();
    const locationId = parseInt(req.params.id, 10);
    const loc = await pool.query(
      'SELECT id, booking_id FROM progress_locations WHERE id = $1',
      [locationId]
    );
    if (!loc.rows[0]) return res.status(404).json({ success: false, message: 'Location not found.' });
    const check = await assertDraftBooking(req, loc.rows[0].booking_id);
    if (check.error) return res.status(check.error.status).json({ success: false, message: check.error.message });
    await pool.query('DELETE FROM progress_locations WHERE id = $1', [locationId]);
    await pool.query('UPDATE progress_bookings SET updated_at = NOW() WHERE id = $1', [loc.rows[0].booking_id]);
    const detail = await loadBookingDetail(loc.rows[0].booking_id);
    return res.json({ success: true, booking: detail });
  } catch (err) {
    console.error('progressDrawings deleteLocation:', err);
    return res.status(500).json({ success: false, message: 'Could not delete location.' });
  }
}

/** DELETE /bookings/:id/locations — remove every mark on the draft booking */
async function clearBookingLocations(req, res) {
  try {
    await ensureSchema();
    const bookingId = parseInt(req.params.id, 10);
    const check = await assertDraftBooking(req, bookingId);
    if (check.error) return res.status(check.error.status).json({ success: false, message: check.error.message });
    await pool.query('DELETE FROM progress_locations WHERE booking_id = $1', [bookingId]);
    await pool.query('UPDATE progress_bookings SET updated_at = NOW() WHERE id = $1', [bookingId]);
    const detail = await loadBookingDetail(bookingId);
    return res.json({ success: true, booking: detail });
  } catch (err) {
    console.error('progressDrawings clearBookingLocations:', err);
    return res.status(500).json({ success: false, message: 'Could not clean drawing.' });
  }
}

function safePdfFilename(detail) {
  const num = String((detail && detail.drawingNumber) || 'drawing')
    .replace(/[^\w\s.-]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return `Progress_${num || 'drawing'}.pdf`;
}

async function assertBookingInWorkspace(req, bookingId) {
  const row = await pool.query('SELECT workspace_id FROM progress_bookings WHERE id = $1', [bookingId]);
  if (!row.rows[0]) return { error: { status: 404, message: 'Booking not found.' } };
  if (Number(row.rows[0].workspace_id) !== Number(req.myDrawings.workspace.id)) {
    return { error: { status: 403, message: 'Booking not in this workspace.' } };
  }
  return { ok: true };
}

async function buildBookingPdfBuffer(bookingId, workspaceId) {
  const detail = await loadBookingDetail(bookingId);
  if (!detail) {
    const err = new Error('Booking not found.');
    err.status = 404;
    throw err;
  }
  if (!detail.drawingId) {
    const err = new Error('This booking has no drawing.');
    err.status = 400;
    throw err;
  }
  const drawing = await pool.query(
    'SELECT relative_path FROM my_drawings_item WHERE id = $1 AND workspace_id = $2',
    [detail.drawingId, workspaceId]
  );
  if (!drawing.rows[0] || !drawing.rows[0].relative_path) {
    const err = new Error('Original drawing PDF was not found.');
    err.status = 404;
    err.code = 'DRAWING_FILE_MISSING';
    throw err;
  }
  const workTypes = await pool.query(
    `SELECT id, name, colour, sort_order
     FROM progress_work_types
     WHERE active = true
     ORDER BY sort_order ASC, name ASC`
  );
  const buffer = await buildProgressDrawingPdf({
    drawingRelativePath: drawing.rows[0].relative_path,
    locations: detail.locations,
    workTypes: workTypes.rows.map((w) => ({
      id: String(w.id),
      name: w.name,
      colour: w.colour,
      sortOrder: w.sort_order,
    })),
    projectName: detail.projectName,
    drawingNumber: detail.drawingNumber,
  });
  return { buffer, detail, filename: safePdfFilename(detail) };
}

/** GET /bookings/:id/pdf */
async function downloadBookingPdf(req, res) {
  try {
    await ensureSchema();
    const bookingId = parseInt(req.params.id, 10);
    const check = await assertBookingInWorkspace(req, bookingId);
    if (check.error) return res.status(check.error.status).json({ success: false, message: check.error.message });
    const built = await buildBookingPdfBuffer(bookingId, req.myDrawings.workspace.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${built.filename.replace(/"/g, '')}"`);
    return res.status(200).send(built.buffer);
  } catch (err) {
    const status = err.status || (err.code === 'DRAWING_FILE_MISSING' ? 404 : 500);
    console.error('progressDrawings downloadBookingPdf:', err);
    return res.status(status).json({ success: false, message: err.message || 'Could not build PDF.' });
  }
}

/** POST /bookings/:id/email  body: { to } */
async function emailBookingPdf(req, res) {
  try {
    await ensureSchema();
    const bookingId = parseInt(req.params.id, 10);
    const check = await assertBookingInWorkspace(req, bookingId);
    if (check.error) return res.status(check.error.status).json({ success: false, message: check.error.message });
    const to = String((req.body && req.body.to) || '').trim();
    if (!EMAIL_RE.test(to)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    const built = await buildBookingPdfBuffer(bookingId, req.myDrawings.workspace.id);
    await sendProgressDrawingEmail({
      to,
      pdfBuffer: built.buffer,
      filename: built.filename,
      drawingNumber: built.detail.drawingNumber,
      projectName: built.detail.projectName,
    });
    return res.json({ success: true, message: 'Sent.' });
  } catch (err) {
    if (err && err.code === 'INVALID_EMAIL') {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err && err.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: 'Email is not configured on this server.' });
    }
    const status = err.status || (err.code === 'DRAWING_FILE_MISSING' ? 404 : 500);
    console.error('progressDrawings emailBookingPdf:', err);
    return res.status(status).json({ success: false, message: err.message || 'Could not send email.' });
  }
}

module.exports = {
  ensureSchema,
  getBootstrap,
  createOrGetDraft,
  getBooking,
  addLocation,
  updateLocation,
  deleteLocation,
  clearBookingLocations,
  downloadBookingPdf,
  emailBookingPdf,
};

