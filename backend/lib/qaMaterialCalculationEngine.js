/**
 * QA Material Auto Calculation Engine.
 * Consumption rules live on materials; templates only list materials per step.
 * @see scripts/alter_qa_material_auto_calc_engine.sql
 */

const CALC_TYPES = new Set(['AREA_BASED', 'LENGTH_BASED', 'COVERAGE_BASED', 'MULTIPLIER_BASED']);

/**
 * Effective divisor/multiplier: explicit consumption_value, else unit_coverage for area-like types.
 */
function effectiveConsumptionValue(materialRow) {
  const type = materialRow.consumption_calc_type;
  const v = materialRow.consumption_value != null ? Number(materialRow.consumption_value) : NaN;
  if (Number.isFinite(v) && v > 0) return v;
  if (type === 'AREA_BASED' || type === 'COVERAGE_BASED') {
    const uc = materialRow.unit_coverage != null ? Number(materialRow.unit_coverage) : NaN;
    if (Number.isFinite(uc) && uc > 0) return uc;
  }
  return null;
}

/**
 * @param {object} materialRow - DB row shape (snake_case ok)
 * @param {{ m2: number, linear: number, units: number }} inputs - parsed step quantities
 * @returns {number|null} raw quantity for this step (before waste/ceil); null = cannot compute / no rule
 */
function computeStepContributionRaw(materialRow, inputs) {
  const type = materialRow.consumption_calc_type;
  if (!type || !CALC_TYPES.has(String(type))) return null;
  const eff = effectiveConsumptionValue(materialRow);
  if (eff == null || eff <= 0) return null;

  const m2 = Number(inputs.m2) || 0;
  const linear = Number(inputs.linear) || 0;

  switch (String(type)) {
    case 'AREA_BASED':
    case 'COVERAGE_BASED':
      if (m2 <= 0) return 0;
      return m2 / eff;
    case 'LENGTH_BASED':
      if (linear <= 0) return 0;
      return linear / eff;
    case 'MULTIPLIER_BASED':
      if (m2 <= 0) return 0;
      return m2 * eff;
    default:
      return null;
  }
}

function parseStepInputs(stepQuantities, stepKey) {
  const o = stepQuantities && typeof stepQuantities === 'object' && !Array.isArray(stepQuantities) ? stepQuantities[stepKey] : null;
  if (!o || typeof o !== 'object') return { m2: 0, linear: 0, units: 0 };
  return {
    m2: parseFloat(o.m2) || 0,
    linear: parseFloat(o.linear) || 0,
    units: parseFloat(o.units) || 0,
  };
}

/**
 * Normalize stepMaterials object stepKey -> materialId[] (strings or numbers).
 */
function eachStepMaterialPair(stepMaterials) {
  const out = [];
  if (!stepMaterials || typeof stepMaterials !== 'object' || Array.isArray(stepMaterials)) return out;
  for (const [stepKey, arr] of Object.entries(stepMaterials)) {
    const sk = String(stepKey).trim();
    if (!sk) continue;
    const list = Array.isArray(arr) ? arr : [];
    for (const mid of list) {
      const id = parseInt(String(mid), 10);
      if (Number.isInteger(id)) out.push({ stepKey: sk, materialId: id });
    }
  }
  return out;
}

/**
 * @param {object} params
 * @param {object} params.stepMaterials - job step materials map
 * @param {object} params.stepQuantities - normalized step quantities
 * @param {Map<number, object>} params.materialsById - material_id -> row (must include consumption fields, unit, name)
 * @param {number} params.templateWastePct - template waste % (0-100+)
 * @returns {{ rows: Array<{ materialId, quantityRequired, unit, calculationType, wasteMaterialPct, wasteTemplatePct, rawSum }>, skipped: Array<{ materialId, stepKey, reason }> }}
 */
function buildJobMaterialRequirements({ stepMaterials, stepQuantities, materialsById, templateWastePct }) {
  const tplWaste = Number(templateWastePct) || 0;
  const tplFactor = 1 + tplWaste / 100;

  const sumByMaterial = new Map();
  const metaByMaterial = new Map();
  const skipped = [];

  for (const { stepKey, materialId } of eachStepMaterialPair(stepMaterials)) {
    const mat = materialsById.get(materialId);
    if (!mat) {
      skipped.push({ materialId, stepKey, reason: 'material_not_found' });
      continue;
    }
    const inputs = parseStepInputs(stepQuantities, stepKey);
    const raw = computeStepContributionRaw(mat, inputs);
    if (raw === null) {
      skipped.push({ materialId, stepKey, reason: 'no_calc_rule_or_invalid_value' });
      continue;
    }
    if (raw <= 0) continue;

    const prev = sumByMaterial.get(materialId) || 0;
    sumByMaterial.set(materialId, prev + raw);
    if (!metaByMaterial.has(materialId)) {
      metaByMaterial.set(materialId, {
        unit: mat.unit || 'pcs',
        calculationType: mat.consumption_calc_type || null,
        wasteMaterialPct: Number(mat.waste_factor_pct) || 0,
      });
    }
  }

  const rows = [];
  for (const [materialId, rawSum] of sumByMaterial.entries()) {
    const meta = metaByMaterial.get(materialId);
    const matWaste = meta.wasteMaterialPct || 0;
    const matFactor = 1 + matWaste / 100;
    const qty = Math.ceil(rawSum * matFactor * tplFactor);
    rows.push({
      materialId,
      quantityRequired: qty,
      unit: meta.unit,
      calculationType: meta.calculationType,
      wasteMaterialPct: matWaste,
      wasteTemplatePct: tplWaste,
      rawSum: rawSum,
    });
  }
  rows.sort((a, b) => a.materialId - b.materialId);
  return { rows, skipped };
}

module.exports = {
  CALC_TYPES,
  effectiveConsumptionValue,
  computeStepContributionRaw,
  parseStepInputs,
  eachStepMaterialPair,
  buildJobMaterialRequirements,
};
