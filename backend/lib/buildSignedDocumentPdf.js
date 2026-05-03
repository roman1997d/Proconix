/**
 * Merge operative signatures / field values onto the original PDF (pdf-lib).
 * - Signature images: uniform scale (aspect ratio preserved), centered in each slot — never stretched.
 * - Many signers: slots split across extra pages inserted after the field page when they do not fit
 *   (minimum readable slot height).
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');

const FIELD_TYPES = ['signature', 'initials', 'date', 'checkbox', 'text'];

/** Minimum slot height (pt) for ink signatures before we spill to another page. */
const MIN_SIGNATURE_SLOT_PT = 38;
/** Minimum slot for text/date/checkbox rows when stacking multiple responses. */
const MIN_TEXT_SLOT_PT = 22;

function parseMeta(m) {
  if (!m) return {};
  if (typeof m === 'object' && !Buffer.isBuffer(m)) return m;
  try {
    return JSON.parse(m);
  } catch (_) {
    return {};
  }
}

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {import('pdf-lib').PDFImage} image
 * @param {number} boxLeft
 * @param {number} slotBottom PDF y of bottom edge of slot
 * @param {number} boxW
 * @param {number} slotH
 */
function drawImageContained(page, image, boxLeft, slotBottom, boxW, slotH) {
  const iw = image.width;
  const ih = image.height;
  if (iw <= 0 || ih <= 0 || boxW <= 0 || slotH <= 0) return;
  const scale = Math.min(boxW / iw, slotH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const x = boxLeft + (boxW - dw) / 2;
  const y = slotBottom + (slotH - dh) / 2;
  page.drawImage(image, {
    x,
    y,
    width: dw,
    height: dh,
  });
}

/**
 * Split list into chunks of at most maxPerPage items (each chunk fits in one field box vertically).
 */
function chunkListForVerticalSlots(list, boxH, minSlotPt) {
  const maxPerPage = Math.max(1, Math.floor(boxH / minSlotPt));
  const chunks = [];
  for (let i = 0; i < list.length; i += maxPerPage) {
    chunks.push(list.slice(i, i + maxPerPage));
  }
  return chunks;
}

async function embedImageFromPath(pdfDoc, absPath) {
  if (!fs.existsSync(absPath)) return null;
  const buf = fs.readFileSync(absPath);
  const lower = absPath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    try {
      return await pdfDoc.embedJpg(buf);
    } catch (_) {
      /* try png below */
    }
  }
  try {
    return await pdfDoc.embedPng(buf);
  } catch (_) {
    try {
      return await pdfDoc.embedJpg(buf);
    } catch (_) {
      return null;
    }
  }
}

/**
 * @param {object} documentRow - row from digital_documents
 * @param {Array<object>} signatureRows - rows from digital_document_signatures (+ user_name, user_email optional)
 * @returns {Promise<Buffer>}
 */
async function buildSignedDocumentPdf(documentRow, signatureRows) {
  const rel = documentRow.file_relative_path;
  if (!rel || String(rel).includes('..')) {
    throw new Error('Invalid document path');
  }
  const abs = path.join(UPLOADS_ROOT, rel);
  if (!fs.existsSync(abs)) {
    throw new Error('Original PDF not found on disk');
  }

  const pdfBytes = fs.readFileSync(abs);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  let fields = documentRow.fields_json;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields || '[]');
    } catch (_) {
      fields = [];
    }
  }
  if (!Array.isArray(fields)) fields = [];

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const byField = {};
  (signatureRows || []).forEach((s) => {
    const fid = String(s.field_id);
    if (!byField[fid]) byField[fid] = [];
    byField[fid].push(s);
  });

  const basePageCount = pdfDoc.getPageCount();
  const maxFieldPage = fields.reduce((mx, f) => Math.max(mx, parseInt(f.page, 10) || 1), 1);
  const refPage = pdfDoc.getPage(basePageCount - 1);
  const { width: refW, height: refH } = refPage.getSize();
  while (pdfDoc.getPageCount() < maxFieldPage) {
    pdfDoc.addPage([refW, refH]);
  }
  /** Logical page index → physical page index (updates when insertPage splits overflow). */
  let logicalToPhysical = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);

  for (let fi = 0; fi < fields.length; fi++) {
    const field = fields[fi];
    if (!field || !field.type) continue;
    if (!FIELD_TYPES.includes(field.type)) continue;

    const pageIndex0 = (parseInt(field.page, 10) || 1) - 1;
    if (pageIndex0 < 0 || pageIndex0 >= logicalToPhysical.length) continue;

    const curIdx = logicalToPhysical[pageIndex0];
    const page0 = pdfDoc.getPage(curIdx);
    const { width: PW, height: PH } = page0.getSize();
    const fx = Number(field.x) || 0;
    const fy = Number(field.y) || 0;
    const fw = Number(field.w) || 0.1;
    const fh = Number(field.h) || 0.1;
    const boxLeft = fx * PW;
    const boxBottom = PH - (fy + fh) * PH;
    const boxW = fw * PW;
    const boxH = fh * PH;

    const list = byField[String(field.id)] || [];
    if (list.length === 0) continue;

    const isInkField = field.type === 'signature' || field.type === 'initials';

    if (isInkField) {
      const chunks = chunkListForVerticalSlots(list, boxH, MIN_SIGNATURE_SLOT_PT);
      let drawPage = logicalToPhysical[pageIndex0];
      for (let c = 0; c < chunks.length; c++) {
        if (c > 0) {
          pdfDoc.insertPage(drawPage + 1, [PW, PH]);
          for (let o = 0; o < logicalToPhysical.length; o++) {
            if (logicalToPhysical[o] > drawPage) logicalToPhysical[o] += 1;
          }
          drawPage += 1;
        }
        const page = pdfDoc.getPage(drawPage);
        const chunk = chunks[c];
        const slotH = boxH / chunk.length;
        for (let i = 0; i < chunk.length; i++) {
          const sig = chunk[i];
          const srel = sig.signature_image_rel_path;
          if (!srel || String(srel).includes('..')) continue;
          const imgAbs = path.join(UPLOADS_ROOT, srel);
          const image = await embedImageFromPath(pdfDoc, imgAbs);
          if (!image) continue;
          const ySlotBottom = boxBottom + i * slotH;
          drawImageContained(page, image, boxLeft, ySlotBottom, boxW, slotH);
        }
      }
      continue;
    }

    /* Text / checkbox / date — stack without overlap; extra pages if needed */
    const chunks = chunkListForVerticalSlots(list, boxH, MIN_TEXT_SLOT_PT);
    let drawPageText = logicalToPhysical[pageIndex0];
    for (let c = 0; c < chunks.length; c++) {
      if (c > 0) {
        pdfDoc.insertPage(drawPageText + 1, [PW, PH]);
        for (let o = 0; o < logicalToPhysical.length; o++) {
          if (logicalToPhysical[o] > drawPageText) logicalToPhysical[o] += 1;
        }
        drawPageText += 1;
      }
      const page = pdfDoc.getPage(drawPageText);
      const chunk = chunks[c];
      const sliceH = boxH / chunk.length;
      for (let i = 0; i < chunk.length; i++) {
        const sig = chunk[i];
        const meta = parseMeta(sig.client_meta);
        const ftype = meta.field_type || field.type;
        let txt = '';
        if (ftype === 'text') txt = meta.text_value != null ? String(meta.text_value) : '';
        else if (ftype === 'date' && meta.date_value) {
          try {
            txt = new Date(meta.date_value).toLocaleString();
          } catch (_) {
            txt = String(meta.date_value);
          }
        } else if (ftype === 'checkbox') {
          txt = meta.checkbox_value ? 'Confirmed / agreed' : '';
        } else {
          continue;
        }
        const who = sig.user_name || sig.user_email || '';
        const parts = [txt, who].filter(Boolean);
        const line = parts.join(' · ').slice(0, 800);
        if (!line) continue;
        const yDraw = boxBottom + i * sliceH;
        const size = Math.min(10, Math.max(5, Math.min(sliceH * 0.35, (boxW / Math.max(line.length, 8)) * 1.2)));
        page.drawText(line, {
          x: boxLeft + 2,
          y: yDraw + Math.max(1, (sliceH - size) / 3),
          size,
          font: helvetica,
          color: rgb(0.1, 0.1, 0.15),
          maxWidth: boxW - 4,
        });
      }
    }
  }

  const out = await pdfDoc.save();
  return Buffer.from(out);
}

module.exports = { buildSignedDocumentPdf };
