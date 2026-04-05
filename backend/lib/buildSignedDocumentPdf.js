/**
 * Merge operative signatures / field values onto the original PDF (pdf-lib).
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');

const FIELD_TYPES = ['signature', 'initials', 'date', 'checkbox', 'text'];

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

  for (let fi = 0; fi < fields.length; fi++) {
    const field = fields[fi];
    if (!field || !field.type) continue;
    if (!FIELD_TYPES.includes(field.type)) continue;

    const pageIndex = (parseInt(field.page, 10) || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;

    const page = pdfDoc.getPage(pageIndex);
    const { width: PW, height: PH } = page.getSize();
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

    const n = list.length;
    const sliceH = n > 1 ? boxH / n : boxH;

    for (let i = 0; i < n; i++) {
      const sig = list[i];
      const meta = parseMeta(sig.client_meta);
      const ftype = meta.field_type || field.type;

      const yDraw = boxBottom + i * sliceH;

      if (ftype === 'checkbox' || ftype === 'date' || ftype === 'text') {
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
        }
        const who = sig.user_name || sig.user_email || '';
        const parts = [txt, who].filter(Boolean);
        const line = parts.join(' · ').slice(0, 800);
        if (line) {
          const size = Math.min(10, Math.max(6, sliceH * 0.32));
          page.drawText(line, {
            x: boxLeft + 2,
            y: yDraw + 2,
            size,
            font: helvetica,
            color: rgb(0.1, 0.1, 0.15),
          });
        }
      } else {
        const srel = sig.signature_image_rel_path;
        if (!srel || String(srel).includes('..')) continue;
        const pngAbs = path.join(UPLOADS_ROOT, srel);
        if (!fs.existsSync(pngAbs)) continue;
        const pngBuf = fs.readFileSync(pngAbs);
        let image;
        try {
          image = await pdfDoc.embedPng(pngBuf);
        } catch (_) {
          continue;
        }
        page.drawImage(image, {
          x: boxLeft,
          y: yDraw,
          width: boxW,
          height: sliceH,
        });
      }
    }
  }

  const out = await pdfDoc.save();
  return Buffer.from(out);
}

module.exports = { buildSignedDocumentPdf };
