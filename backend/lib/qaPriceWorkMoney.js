/**
 * QA price work £ from template step rates × operative quantities (keys "templateId:stepId").
 */

/**
 * @param {Record<string, unknown>} sq stepQuantities
 * @param {number[]} templateIds
 * @param {Map<number, Array<{ template_id: number, id: number, step_external_id?: string | null, price_per_m2?: string | number, price_per_unit?: string | number, price_per_linear?: string | number }>>} stepsByTemplate
 * @returns {{ perKey: Record<string, number>, total: number }}
 */
function computeEntryMoneyForTemplates(sq, templateIds, stepsByTemplate) {
  const perKey = {};
  let total = 0;
  if (!sq || typeof sq !== 'object') return { perKey, total: 0 };
  for (const tid of templateIds) {
    const steps = stepsByTemplate.get(tid) || [];
    for (const s of steps) {
      const sid =
        s.step_external_id != null && String(s.step_external_id).trim() !== ''
          ? String(s.step_external_id)
          : String(s.id);
      const key = `${tid}:${sid}`;
      const q = sq[key];
      if (!q || typeof q !== 'object') continue;
      const pm2 = parseFloat(s.price_per_m2);
      const plin = parseFloat(s.price_per_linear);
      const pun = parseFloat(s.price_per_unit);
      const m2 = parseFloat(q.m2);
      const lin = parseFloat(q.linear);
      const un = parseFloat(q.units);
      let line = 0;
      if (pm2 > 0 && m2 === m2) line += pm2 * m2;
      if (plin > 0 && lin === lin) line += plin * lin;
      if (pun > 0 && un === un) line += pun * un;
      if (line > 0) {
        perKey[key] = Math.round(line * 100) / 100;
        total += line;
      }
    }
  }
  return { perKey, total: Math.round(total * 100) / 100 };
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }} db
 * @param {string|number|null|undefined} qaJobId
 * @returns {Promise<{ templateIds: number[], stepsByTemplate: Map<number, unknown[]> }>}
 */
async function loadStepsByTemplateForQaJob(db, qaJobId) {
  const jid = parseInt(String(qaJobId != null ? qaJobId : ''), 10);
  if (!Number.isInteger(jid)) {
    return { templateIds: [], stepsByTemplate: new Map() };
  }
  let tplRes;
  try {
    tplRes = await db.query(
      'SELECT template_id FROM qa_job_templates WHERE job_id = $1 ORDER BY template_id',
      [jid]
    );
  } catch (e) {
    if (e && e.code === '42P01') return { templateIds: [], stepsByTemplate: new Map() };
    throw e;
  }
  const templateIds = tplRes.rows.map((r) => r.template_id);
  if (templateIds.length === 0) return { templateIds: [], stepsByTemplate: new Map() };
  let stepRows;
  try {
    stepRows = await db.query(
      `SELECT template_id, id, step_external_id, price_per_m2, price_per_unit, price_per_linear
       FROM qa_template_steps WHERE template_id = ANY($1::int[])`,
      [templateIds]
    );
  } catch (e) {
    if (e && e.code === '42P01') return { templateIds: [], stepsByTemplate: new Map() };
    throw e;
  }
  const stepsByTemplate = new Map();
  for (const s of stepRows.rows) {
    if (!stepsByTemplate.has(s.template_id)) stepsByTemplate.set(s.template_id, []);
    stepsByTemplate.get(s.template_id).push(s);
  }
  return { templateIds, stepsByTemplate };
}

module.exports = {
  computeEntryMoneyForTemplates,
  loadStepsByTemplateForQaJob,
};
