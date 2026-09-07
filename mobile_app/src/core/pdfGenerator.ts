import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { WellResult, DiagnosticsSummary, FarmMetadata } from './types';

export async function generateClinicalPdfReport(
  results: WellResult[],
  summary: DiagnosticsSummary,
  farmName = 'AquaFarm Sector 3 - Pond B',
  plateName = 'Plate 0002',
  metadata?: FarmMetadata
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Header Banner
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width: width,
    height: 80,
    color: rgb(0.06, 0.09, 0.16), // #0F172A
  });

  page.drawText('WSSA POINT-OF-CARE DIAGNOSTIC CERTIFICATE', {
    x: 36,
    y: height - 42,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('White Spot Syndrome Assay (WSSA) • AI Mobile Edge Reader', {
    x: 36,
    y: height - 60,
    size: 10,
    font: fontRegular,
    color: rgb(0.23, 0.51, 0.96),
  });

  // Metadata Box
  let curY = height - 115;
  const fName = metadata?.farmName || farmName;
  const pId = metadata?.pondId || 'Pond 03';
  page.drawText(`Facility:  ${fName} (${pId})`, { x: 36, y: curY, size: 9.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Plate ID:        ${plateName}`, { x: 320, y: curY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  curY -= 16;
  const spec = metadata?.species || 'Penaeus vannamei';
  const tech = metadata?.technicianName || 'Field Biologist';
  page.drawText(`Species:   ${spec}`, { x: 36, y: curY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Technician:      ${tech}`, { x: 320, y: curY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  curY -= 16;
  page.drawText(`Date & Time:      ${new Date().toLocaleString()}`, { x: 36, y: curY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Diagnostic Mode: 100% Offline Mobile AI`, { x: 320, y: curY, size: 9.5, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });

  // Outbreak Status Banner
  curY -= 35;
  const isOutbreak = summary.outbreakAlert;
  page.drawRectangle({
    x: 36,
    y: curY - 10,
    width: width - 72,
    height: 40,
    color: isOutbreak ? rgb(0.99, 0.93, 0.93) : rgb(0.93, 0.99, 0.94),
    borderColor: isOutbreak ? rgb(0.86, 0.15, 0.15) : rgb(0.13, 0.65, 0.28),
    borderWidth: 1.5,
  });

  page.drawText(
    isOutbreak ? '⚠️ OUTBREAK ALERT: WHITE SPOT SYNDROME VIRUS (WSSV) DETECTED' : '✅ BIOSECURE: NO PATHOGENS DETECTED',
    {
      x: 48,
      y: curY + 12,
      size: 11,
      font: fontBold,
      color: isOutbreak ? rgb(0.75, 0.1, 0.1) : rgb(0.1, 0.5, 0.2),
    }
  );

  page.drawText(
    `Safety Cut-Off: ${summary.cutoffValue.toFixed(3)} OD  |  Infected Wells: ${summary.positiveCount}  |  Healthy Wells: ${summary.negativeCount}  |  Total Analyzed: ${summary.totalWells}`,
    {
      x: 48,
      y: curY - 2,
      size: 9,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    }
  );

  // Microplate OD Table Header
  curY -= 45;
  page.drawText('Predicted Optical Density (OD) Numerical Matrix (450 nm - 620 nm)', {
    x: 36,
    y: curY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  curY -= 20;
  const colWidth = 38;
  const rowHeight = 16;
  const startX = 40;

  // Header Col Numbers
  for (let c = 1; c <= 12; c++) {
    page.drawText(c.toString(), {
      x: startX + c * colWidth - 8,
      y: curY,
      size: 8,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  // Rows A - H
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const resultMap = new Map<string, WellResult>();
  for (const r of results) {
    resultMap.set(`${r.row}_${r.col}`, r);
  }

  for (let rIdx = 0; rIdx < 8; rIdx++) {
    const rLetter = rows[rIdx];
    curY -= rowHeight;

    page.drawText(rLetter, {
      x: startX - 10,
      y: curY + 2,
      size: 9,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    for (let c = 1; c <= 12; c++) {
      const well = resultMap.get(`${rLetter}_${c}`);
      const valStr = well ? well.predictedOd.toFixed(2) : '-';
      const isPos = well ? well.predictedOd > summary.cutoffValue : false;

      page.drawText(valStr, {
        x: startX + c * colWidth - 14,
        y: curY + 2,
        size: 7.5,
        font: fontRegular,
        color: isPos ? rgb(0.85, 0.1, 0.1) : rgb(0.1, 0.1, 0.1),
      });
    }
  }

  // Compliance & Standard Footnote
  curY -= 50;
  page.drawLine({
    start: { x: 36, y: curY },
    end: { x: width - 36, y: curY },
    color: rgb(0.8, 0.8, 0.8),
    thickness: 0.5,
  });

  curY -= 18;
  page.drawText('WOAH Manual of Diagnostic Tests for Aquatic Animals • Protocol 3-SD Negative Baseline', {
    x: 36,
    y: curY,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText('Generated completely on-device via AI Mobile ELISA Diagnostic Suite (YOLOv8 + ExtraTrees)', {
    x: 36,
    y: curY - 12,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  });

  return await pdfDoc.save();
}

export function downloadPdf(bytes: Uint8Array, filename = 'WSSA_Diagnostic_Report.pdf') {
  const blob = new Blob([bytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
