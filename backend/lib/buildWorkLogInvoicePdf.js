/**
 * PDF buffer for work log invoice email attachment (PDFKit + proconixPdfTemplate).
 */

const PDFDocument = require('pdfkit');
const { renderWorkLogInvoice } = require('../templates/pdfkit/proconixPdfTemplate');

/**
 * @param {{
 *   companyName: string,
 *   workerName: string,
 *   workerEmail?: string,
 *   jobDisplayId: string,
 *   projectName: string,
 *   workType: string,
 *   totalStr: string,
 *   description: string,
 *   detailLines: string[],
 *   issuedAt?: Date,
 * }} opts
 * @returns {Promise<Buffer>}
 */
function buildWorkLogInvoicePdfBuffer(opts) {
  return new Promise(function (resolve, reject) {
    var doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    var chunks = [];
    doc.on('data', function (d) {
      chunks.push(d);
    });
    doc.on('end', function () {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
    try {
      renderWorkLogInvoice(doc, opts || {});
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { buildWorkLogInvoicePdfBuffer };
