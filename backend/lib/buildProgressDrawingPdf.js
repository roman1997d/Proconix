/**
 * Overlay Progress Drawings marks + top-left colour legend onto the original PDF (pdf-lib).
 *
 * Marks are stored in pdf.js viewport space (top-left origin, rotation applied).
 * Many CAD PDFs also leave a flipped/unbalanced CTM on content streams, so we never
 * append onto the source page — we stamp it upright onto a fresh page first.
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
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

function normalizeAngle(angle) {
  return ((Number(angle) || 0) % 360 + 360) % 360;
}

/** Match pdf.js viewport size for a page (MediaBox + /Rotate). */
function viewportSizeForPage(srcPage) {
  const { width: mediaW, height: mediaH } = srcPage.getSize();
  const angle = normalizeAngle(srcPage.getRotation().angle);
  if (angle === 90 || angle === 270) {
    return { vpW: mediaH, vpH: mediaW, mediaW, mediaH, angle };
  }
  return { vpW: mediaW, vpH: mediaH, mediaW, mediaH, angle };
}

/**
 * Draw a source page onto an output page so visual orientation matches pdf.js
 * (and on-screen Progress Drawings marks).
 */
function drawSourcePageUpright(outPage, embeddedPage, meta) {
  const { vpW, vpH, mediaW, mediaH, angle } = meta;
  if (angle === 90) {
    outPage.drawPage(embeddedPage, {
      x: 0,
      y: vpH,
      width: mediaW,
      height: mediaH,
      rotate: degrees(-90),
    });
    return;
  }
  if (angle === 180) {
    outPage.drawPage(embeddedPage, {
      x: vpW,
      y: vpH,
      width: mediaW,
      height: mediaH,
      rotate: degrees(180),
    });
    return;
  }
  if (angle === 270) {
    outPage.drawPage(embeddedPage, {
      x: vpW,
      y: 0,
      width: mediaW,
      height: mediaH,
      rotate: degrees(90),
    });
    return;
  }
  outPage.drawPage(embeddedPage, {
    x: 0,
    y: 0,
    width: mediaW,
    height: mediaH,
  });
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

  const pageMetas = srcPages.map((srcPage) => viewportSizeForPage(srcPage));
  const pages = embeddedPages.map((emb, i) => {
    const meta = pageMetas[i];
    const page = outDoc.addPage([meta.vpW, meta.vpH]);
    drawSourcePageUpright(page, emb, meta);
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
    /* ~3× previous legend scale for site readability on large drawings. */
    const pad = 21;
    const marginX = 30;
    const top = pageH - 30;
    const swatchW = 48;
    const fontSize = 24;
    const rowH = 36;

    const rows = legendTypes.map((wt) => {
      const label = ' --- "' + String(wt.name || 'Work type') + '"';
      return {
        wt,
        label,
        textW: font.widthOfTextAtSize(label, fontSize),
      };
    });
    const innerW = Math.max.apply(null, rows.map((r) => swatchW + r.textW));
    const boxW = Math.min(pageW * 0.72, innerW + pad * 2);
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
      borderWidth: 1.35,
      opacity: 0.94,
    });

    let y = top - pad - fontSize + 3;
    rows.forEach((row) => {
      const colour = hexToRgb(row.wt.colour);
      page.drawLine({
        start: { x: boxX + pad, y: y + 8 },
        end: { x: boxX + pad + swatchW, y: y + 8 },
        thickness: 9.6,
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
    const pageH = page.getSize().height;
    const ann = (loc.annotations && loc.annotations[0]) || {};
    const wt = wtById[String(ann.workTypeId)] || {};
    const colour = hexToRgb(ann.colour || wt.colour || '#2563eb');
    const x = Number(loc.x);
    const y = Number(loc.y);
    const w = Number(loc.width);
    const h = Number(loc.height);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return;

    /* Viewport/top-left → clean page bottom-left (same space as upright stamp). */
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

module.exports = {
  buildProgressDrawingPdf,
  absFromRelative,
  viewportSizeForPage,
  drawSourcePageUpright,
};
