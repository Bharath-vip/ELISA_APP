import type { WellResult, DiagnosticsSummary } from './types';

export function evaluatePlateDiagnostics(
  rawResults: { row: string; col: number; predictedOd: number; trueOd?: number | null; cx: number; cy: number; radius: number; cropDataUrl?: string; features?: Record<string, number> }[]
): { results: WellResult[]; summary: DiagnosticsSummary } {
  const ods = rawResults.map((r) => r.predictedOd);
  if (ods.length === 0) {
    return {
      results: [],
      summary: {
        totalWells: 0,
        positiveCount: 0,
        negativeCount: 0,
        cutoffValue: 0.15,
        meanNeg: 0.1,
        sdNeg: 0.02,
        outbreakAlert: false,
      },
    };
  }

  // 1. Estimate negative control baseline (bottom 15% or OD <= 0.15)
  const sortedOds = [...ods].sort((a, b) => a - b);
  const p15 = sortedOds[Math.floor(sortedOds.length * 0.15)] ?? sortedOds[0];
  const threshold = Math.max(p15, 0.12);

  let negControls = ods.filter((od) => od <= threshold);
  if (negControls.length === 0) negControls = [sortedOds[0]];

  const meanNeg = negControls.reduce((a, b) => a + b, 0) / negControls.length;
  const variance =
    negControls.length > 1
      ? negControls.reduce((sum, v) => sum + (v - meanNeg) ** 2, 0) / (negControls.length - 1)
      : 0.0004;
  const sdNeg = Math.max(Math.sqrt(variance), 0.015);

  // WOAH Cut-off formula: Mean_Neg + 3 * SD_Neg
  const cutoffValue = meanNeg + 3 * sdNeg;

  let positiveCount = 0;
  let negativeCount = 0;

  const results: WellResult[] = rawResults.map((w) => {
    let status: 'POSITIVE' | 'NEGATIVE' | 'BORDERLINE';
    if (w.predictedOd > cutoffValue + 0.02) {
      status = 'POSITIVE';
      positiveCount++;
    } else if (w.predictedOd >= cutoffValue - 0.02) {
      status = 'BORDERLINE';
      positiveCount++;
    } else {
      status = 'NEGATIVE';
      negativeCount++;
    }

    return {
      row: w.row as any,
      col: w.col,
      predictedOd: w.predictedOd,
      trueOd: w.trueOd,
      status,
      cx: w.cx,
      cy: w.cy,
      radius: w.radius,
      cropDataUrl: w.cropDataUrl,
      features: w.features,
    };
  });

  const summary: DiagnosticsSummary = {
    totalWells: results.length,
    positiveCount,
    negativeCount,
    cutoffValue,
    meanNeg,
    sdNeg,
    outbreakAlert: positiveCount > 0,
  };

  return { results, summary };
}
