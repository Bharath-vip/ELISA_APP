import type { WellResult, DiagnosticsSummary, FarmMetadata } from './types';

export function generatePlateCsv(
  results: WellResult[],
  summary: DiagnosticsSummary,
  numCols: number,
  plateTitle: string,
  metadata?: FarmMetadata
): string {
  const lines: string[] = [];

  // 1. Header Metadata Section
  lines.push('# ============================================================');
  lines.push('# WSSA MOBILE ELISA READER - CLINICAL DIAGNOSTIC EXPORT');
  lines.push('# ============================================================');
  lines.push(`# Plate Title: ${plateTitle}`);
  lines.push(`# Timestamp: ${new Date().toISOString()}`);
  lines.push(`# Farm Name: ${metadata?.farmName || 'Pacific Aqua Hatchery'}`);
  lines.push(`# Pond / Tank ID: ${metadata?.pondId || 'Pond 03 - Nursery'}`);
  lines.push(`# Shrimp Species: ${metadata?.species || 'Penaeus vannamei'}`);
  lines.push(`# Technician: ${metadata?.technicianName || 'Field Biologist'}`);
  if (metadata?.tempCelsius) lines.push(`# Water Temp: ${metadata.tempCelsius} °C`);
  if (metadata?.salinityPpt) lines.push(`# Salinity: ${metadata.salinityPpt} ppt`);
  lines.push(`# Negative Baseline: ${summary.meanNeg.toFixed(4)} OD (SD: ${summary.sdNeg.toFixed(4)})`);
  lines.push(`# Diagnostic Cutoff: ${summary.cutoffValue.toFixed(4)} OD`);
  lines.push(`# Outbreak Triage Status: ${summary.outbreakAlert ? 'PATHOGEN OUTBREAK DETECTED' : 'BIOSECURITY SAFE'}`);
  lines.push(`# Total Wells: ${summary.totalWells} | Positive: ${summary.positiveCount} | Negative: ${summary.negativeCount}`);
  lines.push('');

  // 2. 8x12 Matrix Section
  lines.push('# 8x12 PREDICTED OPTICAL DENSITY (OD) MATRIX');
  const colHeaders = ['Row', ...Array.from({ length: numCols }, (_, i) => `${i + 1}`)];
  lines.push(colHeaders.join(','));

  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
  for (const r of rows) {
    const rowVals: string[] = [r];
    for (let c = 1; c <= numCols; c++) {
      const well = results.find((w) => (w.row as string) === r && w.col === c);
      rowVals.push(well ? well.predictedOd.toFixed(4) : '');
    }
    lines.push(rowVals.join(','));
  }
  lines.push('');

  // 3. Tabular Well-by-Well Detailed List
  lines.push('# DETAILED WELL-BY-WELL READINGS');
  lines.push('Well_ID,Row,Column,Predicted_OD_450nm,Cutoff_Threshold,Signal_to_Cutoff_Ratio,Diagnostic_Call');
  for (const w of results) {
    const ratio = (w.predictedOd / Math.max(summary.cutoffValue, 0.001)).toFixed(2);
    lines.push(`${w.row}${w.col},${w.row},${w.col},${w.predictedOd.toFixed(4)},${summary.cutoffValue.toFixed(4)},${ratio},${w.status}`);
  }

  return lines.join('\n');
}

export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyMatrixToClipboard(
  results: WellResult[],
  numCols: number
): Promise<boolean> {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
  const lines: string[] = [];

  // Header line
  lines.push(['Row', ...Array.from({ length: numCols }, (_, i) => `${i + 1}`)].join('\t'));

  for (const r of rows) {
    const vals: string[] = [r];
    for (let c = 1; c <= numCols; c++) {
      const well = results.find((w) => (w.row as string) === r && w.col === c);
      vals.push(well ? well.predictedOd.toFixed(3) : '-');
    }
    lines.push(vals.join('\t'));
  }

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    return true;
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    return false;
  }
}
