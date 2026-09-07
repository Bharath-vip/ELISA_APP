import type { WellResult, DiagnosticsSummary } from './types';

export function evaluatePlateDiagnostics(
  rawResults: { row: string; col: number; predictedOd: number; trueOd?: number | null; cx: number; cy: number; radius: number; cropDataUrl?: string; features?: Record<string, number> }[],
  customCutoff = 0.300
): { results: WellResult[]; summary: DiagnosticsSummary } {
  const ods = rawResults.map((r) => r.predictedOd);
  if (ods.length === 0) {
    return {
      results: [],
      summary: {
        totalWells: 0,
        positiveCount: 0,
        negativeCount: 0,
        cutoffValue: customCutoff,
        meanNeg: 0,
        sdNeg: 0,
        outbreakAlert: false,
      },
    };
  }

  const cutoffValue = customCutoff;
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
    meanNeg: 0,
    sdNeg: 0,
    outbreakAlert: positiveCount > 0,
  };

  return { results, summary };
}

export function reevaluatePlateDiagnostics(
  existingResults: WellResult[],
  customCutoff: number
): { results: WellResult[]; summary: DiagnosticsSummary } {
  let positiveCount = 0;
  let negativeCount = 0;

  const results: WellResult[] = existingResults.map((w) => {
    let status: 'POSITIVE' | 'NEGATIVE' | 'BORDERLINE';
    if (w.predictedOd > customCutoff + 0.02) {
      status = 'POSITIVE';
      positiveCount++;
    } else if (w.predictedOd >= customCutoff - 0.02) {
      status = 'BORDERLINE';
      positiveCount++;
    } else {
      status = 'NEGATIVE';
      negativeCount++;
    }

    return {
      ...w,
      status,
    };
  });

  const summary: DiagnosticsSummary = {
    totalWells: results.length,
    positiveCount,
    negativeCount,
    cutoffValue: customCutoff,
    meanNeg: 0,
    sdNeg: 0,
    outbreakAlert: positiveCount > 0,
  };

  return { results, summary };
}
