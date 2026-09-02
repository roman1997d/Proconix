/**
 * Overlay Progress Drawings marks + top-left colour legend onto the original PDF (pdf-lib).
 *
 * Important: many CAD/export PDFs leave a flipped CTM (or unbalanced q/Q) on the page
 * content stream. Appending marks there shifts them. We always stamp the source page
 * onto a fresh page first, then draw in clean user space.
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { UPLOADS_ROOT } = require('../middleware/resolveCompanyDocsDir');

function absFromRelative(relativePath) {
  if (!relativePath) return null;
  const abs = path.resolve(UPLOADS_ROOT, String(relativePath).split('/').join(path.sep));
  const root = UPLOADS_ROOT.endsWith(path.sep) ? UPLOADS_ROOT : UPLOADS_ROOT + path.sep;
  if (abs !== UPLOADS_ROOT && !abs.startsWith(root)) return null;
  return abs;
}

function hexToRgb(hex) {
  let h = String(hex || '#2563eb').replace('#', '').trim();
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return rgb(0.15, 0.39, 0.92);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * @param {{
 *   drawingRelativePath: string,
 *   locations: Array<{ pageIndex:number, x:number, y:number, width:number, height:number, markKind?:string, annotations?:Array<{ colour?:string, workTypeId?:string|number }> }>,
 *   workTypes: Array<{ id:string|number, name:string, colour:string, sortOrder?:number }>,
 *   projectName?: string,
 *   drawingNumber?: string,
 * }} opts
 * @returns {Promise<Buffer>}
 */
async function buildProgressDrawingPdf(opts) {
  const abs = absFromRelative(opts.drawingRelativePath);
  if (!abs || !fs.existsSync(abs)) {
    const err = new Error('Original drawing PDF was not found on disk.');
    err.code = 'DRAWING_FILE_MISSING';
    throw err;
  }

  const bytes = fs.readFileSync(abs);
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const srcPages = srcDoc.getPages();

  const embeddedPages = await outDoc.embedPages(srcPages);
  const pages = embeddedPages.map((emb, i) => {
    const { width, height } = srcPages[i].getSize();
    const page = outDoc.addPage([width, height]);
    page.drawPage(emb, { x: 0, y: 0, width, height });
    return page;
  });

  const wtById = {};
  (opts.workTypes || []).forEach((w) => {
    wtById[String(w.id)] = w;
  });

  const legendTypes = (opts.workTypes || []).slice().sort((a, b) => {
    const ao = Number(a.sortOrder) || 0;
    const bo = Number(b.sortOrder) || 0;
    return ao - bo || String(a.name).localeCompare(String(b.name));
  });

  function drawLegend(page) {
    if (!legendTypes.length) return;
    const { width: pageW, height: pageH } = page.getSize();
    const pad = 7;
    const marginX = 10;
    const top = pageH - 10;
    const swatchW = 16;
    const fontSize = 8;
    const rowH = 12;

    const rows = legendTypes.map((wt) => {
      const label = ' --- "' + String(wt.name || 'Work type') + '"';
      return {
        wt,
        label,
        textW: font.widthOfTextAtSize(label, fontSize),
      };
    });
    const innerW = Math.max.apply(null, rows.map((r) => swatchW + r.textW));
    const boxW = Math.min(pageW * 0.5, innerW + pad * 2);
    const boxH = pad + rows.length * rowH + pad;
    const boxX = marginX;
    const boxY = top - boxH;

    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.72, 0.75, 0.8),
      borderWidth: 0.45,
      opacity: 0.94,
    });

    let y = top - pad - fontSize + 1;
    rows.forEach((row) => {
      const colour = hexToRgb(row.wt.colour);
      page.drawLine({
        start: { x: boxX + pad, y: y + 3 },
        end: { x: boxX + pad + swatchW, y: y + 3 },
        thickness: 3.2,
        color: colour,
      });
      page.drawText(row.label, {
        x: boxX + pad + swatchW,
        y,
        size: fontSize,
        font,
        color: rgb(0.08, 0.08, 0.1),
      });
      y -= rowH;
    });
  }

  const pagesWithMarks = {};
  (opts.locations || []).forEach((loc) => {
    const idx = Math.max(0, Number(loc.pageIndex) || 0);
    pagesWithMarks[idx] = true;
  });

  (opts.locations || []).forEach((loc) => {
    const idx = Math.max(0, Number(loc.pageIndex) || 0);
    const page = pages[idx];
    if (!page) return;
    const { height: pageH } = page.getSize();
    const ann = (loc.annotations && loc.annotations[0]) || {};
    const wt = wtById[String(ann.workTypeId)] || {};
    const colour = hexToRgb(ann.colour || wt.colour || '#2563eb');
    const x = Number(loc.x);
    const y = Number(loc.y);
    const w = Number(loc.width);
    const h = Number(loc.height);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return;

    /* Stored coords use top-left origin (pdf.js viewport); clean page is bottom-left. */
    const kind = loc.markKind === 'line' ? 'line' : 'rect';
    if (kind === 'line') {
      page.drawLine({
        start: { x: x, y: pageH - y },
        end: { x: x + w, y: pageH - (y + h) },
        thickness: 1.35,
        color: colour,
      });
    } else {
      const rw = Math.abs(w);
      const rh = Math.abs(h);
      const rx = w >= 0 ? x : x + w;
      const ryTop = h >= 0 ? y : y + h;
      page.drawRectangle({
        x: rx,
        y: pageH - ryTop - rh,
        width: rw,
        height: rh,
        borderColor: colour,
        borderWidth: 1.35,
      });
    }
  });

  if (pages[0]) drawLegend(pages[0]);
  Object.keys(pagesWithMarks).forEach((k) => {
    const idx = parseInt(k, 10);
    if (idx > 0 && pages[idx]) drawLegend(pages[idx]);
  });

  const out = await outDoc.save();
  return Buffer.from(out);
}

module.exports = { buildProgressDrawingPdf, absFromRelative };
