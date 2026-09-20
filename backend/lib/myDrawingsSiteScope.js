/**
 * Site (șantier) scope for My Drawings.
 * Company = workspace; site = my_drawings_project.
 */

const { pool } = require('../db/pool');
const { siteLocationFields } = require('./myDrawingsLocations');

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function requestedSiteId(req) {
  const header = req && req.headers && req.headers['x-mydrawings-site'];
  const query = req && req.query && (req.query.siteId || req.query.projectId || req.query.project);
  const body = req && req.body && (req.body.siteId || req.body.projectId);
  return positiveInt(header) || positiveInt(query) || positiveInt(body);
}

async function listWorkspaceSites(workspaceId) {
  const wsId = positiveInt(workspaceId);
  if (!wsId) return [];
  const rows = await pool.query(
    `SELECT p.id, p.name, p.access_code, p.manager_worker_id, p.created_at,
            p.floor_count, p.extra_locations,
            w.first_name AS manager_first, w.last_name AS manager_last, w.email AS manager_email,
            (SELECT COUNT(*)::int FROM my_drawings_item i WHERE i.project_id = p.id) AS drawing_count,
            (SELECT COUNT(*)::int FROM my_drawings_worker u WHERE u.project_id = p.id) AS worker_count
     FROM my_drawings_project p
     LEFT JOIN my_drawings_worker w ON w.id = p.manager_worker_id
     WHERE p.workspace_id = $1
     ORDER BY p.id ASC`,
    [wsId]
  );
  return rows.rows.map(siteToClient);
}

function siteToClient(row) {
  const managerName = [row.manager_first, row.manager_last].filter(Boolean).join(' ').trim();
  const loc = siteLocationFields(row);
  return {
    id: row.id,
    name: row.name,
    accessCode: row.access_code || '',
    managerWorkerId: row.manager_worker_id || null,
    managerName: managerName || '',
    managerEmail: row.manager_email || '',
    drawingCount: row.drawing_count || 0,
    workerCount: row.worker_count || 0,
    floorCount: loc.floorCount,
    extraLocations: loc.extraLocations,
    locations: loc.locations,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function loadSiteRow(workspaceId, siteId) {
  const wsId = positiveInt(workspaceId);
  const id = positiveInt(siteId);
  if (!wsId || !id) return null;
  const found = await pool.query(
    'SELECT id, name, access_code, manager_worker_id, wall_types_pack, floor_count, extra_locations FROM my_drawings_project WHERE id = $1 AND workspace_id = $2',
    [id, wsId]
  );
  return found.rows[0] || null;
}

async function findSiteByAccessCode(code) {
  const normalized = String(code || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{6,10}$/.test(normalized)) return null;
  const bySite = await pool.query(
    `SELECT p.id, p.name, p.access_code, p.workspace_id, p.manager_worker_id,
            ws.name AS workspace_name, ws.manager_name, ws.email AS workspace_email
     FROM my_drawings_project p
     JOIN my_drawings_workspace ws ON ws.id = p.workspace_id
     WHERE UPPER(p.access_code) = $1`,
    [normalized]
  );
  if (bySite.rows[0]) return bySite.rows[0];
  const byCompany = await pool.query(
    `SELECT p.id, p.name, p.access_code, p.workspace_id, p.manager_worker_id,
            ws.name AS workspace_name, ws.manager_name, ws.email AS workspace_email
     FROM my_drawings_workspace ws
     JOIN my_drawings_project p ON p.workspace_id = ws.id
     WHERE UPPER(ws.access_code) = $1
     ORDER BY p.id ASC
     LIMIT 1`,
    [normalized]
  );
  return byCompany.rows[0] || null;
}

async function attachCurrentSite(req, ctx) {
  if (!ctx || !ctx.workspace) return ctx;
  const workspaceId = ctx.workspace.id;
  const sites = await listWorkspaceSites(workspaceId);
  ctx.sites = sites;
  ctx.siteCount = sites.length;
  if (ctx.role === 'worker') {
    const fromCtx = ctx.project && positiveInt(ctx.project.id);
    const owned = fromCtx && sites.find((s) => Number(s.id) === Number(fromCtx));
    ctx.project = owned || sites[0] || ctx.project || null;
    return ctx;
  }
  if (ctx.role === 'admin' || ctx.role === 'site_manager') {
    const wanted = requestedSiteId(req);
    const match = wanted && sites.find((s) => Number(s.id) === Number(wanted));
    ctx.project = match || (ctx.project && sites.find((s) => Number(s.id) === Number(ctx.project.id))) || sites[0] || null;
  }
  return ctx;
}

function canManageSite(ctx) {
  return !!(ctx && (ctx.role === 'admin' || ctx.role === 'site_manager'));
}

function isCompanyHead(ctx) {
  return !!(ctx && ctx.role === 'admin');
}

function currentSiteId(ctx) {
  return ctx && ctx.project ? positiveInt(ctx.project.id) : null;
}

module.exports = {
  positiveInt,
  requestedSiteId,
  listWorkspaceSites,
  loadSiteRow,
  findSiteByAccessCode,
  attachCurrentSite,
  canManageSite,
  isCompanyHead,
  currentSiteId,
  siteToClient,
};
