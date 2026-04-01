/**
 * Seat counting for companies: manager rows + users rows vs optional companies.user_limit.
 */

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {number} companyId
 * @returns {Promise<number>}
 */
async function countCompanySeats(db, companyId) {
  const m = await db.query('SELECT COUNT(*)::int AS n FROM manager WHERE company_id = $1', [companyId]);
  const u = await db.query('SELECT COUNT(*)::int AS n FROM users WHERE company_id = $1', [companyId]);
  const nm = m.rows[0] && m.rows[0].n != null ? Number(m.rows[0].n) : 0;
  const nu = u.rows[0] && u.rows[0].n != null ? Number(u.rows[0].n) : 0;
  return nm + nu;
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {number} companyId
 * @returns {Promise<{ current: number, limit: number | null, atLimit: boolean }>}
 */
async function getCompanySeatInfo(db, companyId) {
  let limit = null;
  try {
    const c = await db.query('SELECT user_limit FROM companies WHERE id = $1', [companyId]);
    if (c.rows.length && c.rows[0].user_limit != null) {
      const n = Number(c.rows[0].user_limit);
      if (Number.isInteger(n) && n >= 1) limit = n;
    }
  } catch (e) {
    if (e.code !== '42703') throw e;
  }
  const current = await countCompanySeats(db, companyId);
  const atLimit = limit != null && current >= limit;
  return { current, limit, atLimit };
}

module.exports = {
  countCompanySeats,
  getCompanySeatInfo,
};
