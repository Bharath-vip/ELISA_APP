import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import type { WellResult, DiagnosticsSummary } from './types';

export function generatePlateCsv(
  results: WellResult[],
  summary: DiagnosticsSummary,
  numCols: number,
  plateTitle: string
): string {
  const lines: string[] = [];

  lines.push(`Plate: ${plateTitle}`);
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push(`Cutoff: ${summary.cutoffValue.toFixed(4)} OD`);
  lines.push(`Positive Wells: ${summary.positiveCount}/${summary.totalWells}`);
  lines.push('');

  // 8x12 Matrix
  lines.push('Row,' + Array.from({ length: numCols }, (_, i) => `${i + 1}`).join(','));

  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
  for (const r of rows) {
    const rowVals: string[] = [r];
    for (let c = 1; c <= numCols; c++) {
      const well = results.find((w) => (w.row as string) === r && w.col === c);
      rowVals.push(well ? well.predictedOd.toFixed(3) : '');
    }
    lines.push(rowVals.join(','));
  }

  lines.push('');
  lines.push('Well,Row,Column,OD_450nm,Cutoff,Status');
  for (const w of results) {
    lines.push(`${w.row}${w.col},${w.row},${w.col},${w.predictedOd.toFixed(3)},${summary.cutoffValue.toFixed(3)},${w.status}`);
  }

  return lines.join('\n');
}

export async function downloadCsv(csvContent: string, filename = 'ELISA_Data.csv'): Promise<void> {
  // 1. Capacitor native on Android
  if (Capacitor.isNativePlatform()) {
    try {
      const saved = await Filesystem.writeFile({
        path: filename,
        data: csvContent,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: filename,
        text: 'ELISA Diagnostic CSV Data',
        url: saved.uri,
        dialogTitle: 'Save or Share CSV',
      });
      return;
    } catch (err) {
      console.warn('Capacitor native CSV share failed, falling back:', err);
    }
  }

  // 2. Browser fallback
  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (e) {
    console.error('Browser CSV download error:', e);
  }
}

export async function copyMatrixToClipboard(
  results: WellResult[],
  numCols: number
): Promise<boolean> {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
  const lines: string[] = [];

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
