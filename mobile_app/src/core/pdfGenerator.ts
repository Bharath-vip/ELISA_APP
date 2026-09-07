import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import type { WellResult, DiagnosticsSummary } from './types';

export async function generateClinicalPdfReport(
  results: WellResult[],
  summary: DiagnosticsSummary,
  plateName = 'Plate Analysis'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Header Banner
  page.drawRectangle({
    x: 0,
    y: height - 70,
    width: width,
    height: 70,
    color: rgb(0.08, 0.12, 0.20),
  });

  page.drawText('ELISA PLATE DIAGNOSTIC REPORT', {
    x: 36,
    y: height - 42,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('96-Well Microplate Optical Density (OD) Quantification', {
    x: 36,
    y: height - 58,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.38, 0.65, 0.98),
  });

  // Metadata Box
  let curY = height - 95;
  page.drawText(`Sample / Plate: ${plateName}`, { x: 36, y: curY, size: 10, font: fontBold, color: rgb(0.15, 0.15, 0.15) });
  page.drawText(`Date: ${new Date().toLocaleString()}`, { x: 340, y: curY, size: 9.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });

  // Summary Banner
  curY -= 35;
  const isPos = summary.outbreakAlert;
  page.drawRectangle({
    x: 36,
    y: curY - 10,
    width: width - 72,
    height: 36,
    color: isPos ? rgb(0.99, 0.93, 0.93) : rgb(0.93, 0.99, 0.94),
    borderColor: isPos ? rgb(0.86, 0.15, 0.15) : rgb(0.13, 0.65, 0.28),
    borderWidth: 1,
  });

  page.drawText(
    isPos
      ? `STATUS: POSITIVE DETECTED (${summary.positiveCount} of ${summary.totalWells} wells above cutoff)`
      : `STATUS: ALL NEGATIVE (${summary.negativeCount} of ${summary.totalWells} wells healthy)`,
    {
      x: 48,
      y: curY + 4,
      size: 11,
      font: fontBold,
      color: isPos ? rgb(0.75, 0.1, 0.1) : rgb(0.1, 0.5, 0.2),
    }
  );

  // Key Statistics
  curY -= 35;
  page.drawText(`Negative Baseline: ${summary.meanNeg.toFixed(4)} OD`, { x: 36, y: curY, size: 9.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Standard Deviation: ${summary.sdNeg.toFixed(4)}`, { x: 210, y: curY, size: 9.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`Cutoff Threshold: ${summary.cutoffValue.toFixed(4)} OD`, { x: 380, y: curY, size: 9.5, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

  // 8x12 Matrix Table
  curY -= 30;
  page.drawText('Predicted Optical Density Matrix (450 nm)', {
    x: 36,
    y: curY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  curY -= 15;
  const startX = 36;
  const colW = 40;
  const rowH = 18;

  // Column headers
  page.drawText('Row', { x: startX + 4, y: curY, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.4) });
  for (let c = 1; c <= 12; c++) {
    page.drawText(`${c}`, {
      x: startX + 30 + (c - 1) * colW + 12,
      y: curY,
      size: 8,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const rowLetter = rows[rIdx];
    const yPos = curY - 14 - rIdx * rowH;

    page.drawText(rowLetter, {
      x: startX + 8,
      y: yPos + 4,
      size: 8.5,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    for (let c = 1; c <= 12; c++) {
      const well = results.find((w) => w.row === rowLetter && w.col === c);
      const cellX = startX + 30 + (c - 1) * colW;

      if (well) {
        const wellIsPos = well.predictedOd > summary.cutoffValue;
        page.drawRectangle({
          x: cellX + 1,
          y: yPos,
          width: colW - 2,
          height: rowH - 2,
          color: wellIsPos ? rgb(0.99, 0.90, 0.90) : rgb(0.95, 0.97, 0.99),
        });

        page.drawText(well.predictedOd.toFixed(2), {
          x: cellX + 8,
          y: yPos + 4,
          size: 8,
          font: wellIsPos ? fontBold : fontRegular,
          color: wellIsPos ? rgb(0.8, 0.1, 0.1) : rgb(0.15, 0.15, 0.15),
        });
      }
    }
  }

  // Footer
  const footerY = 40;
  page.drawLine({
    start: { x: 36, y: footerY + 12 },
    end: { x: width - 36, y: footerY + 12 },
    color: rgb(0.85, 0.85, 0.85),
    thickness: 0.5,
  });

  page.drawText('Automated ELISA Plate Reader • Standard 3-SD Negative Cutoff Protocol', {
    x: 36,
    y: footerY,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  });

  return await pdfDoc.save();
}

export async function downloadPdf(bytes: Uint8Array, filename = 'ELISA_Report.pdf'): Promise<void> {
  // 1. If running natively in Capacitor (Android phone)
  if (Capacitor.isNativePlatform()) {
    try {
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      const saved = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });

      await Share.share({
        title: filename,
        text: 'ELISA Diagnostic Report',
        url: saved.uri,
        dialogTitle: 'Save or Share PDF Report',
      });
      return;
    } catch (err) {
      console.warn('Capacitor native share failed, falling back:', err);
    }
  }

  // 2. Standard Browser Download
  try {
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (e) {
    console.error('Browser PDF download error:', e);
  }
}
