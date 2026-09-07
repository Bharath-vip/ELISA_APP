import type { WellResult, DiagnosticsSummary, OpticalQualityMetrics, FarmMetadata } from './types';
import { detectWellsYolo } from './yoloDetector';
import { regularizeWellGrid } from './homography';
import {
  getTrimmedWellPixels,
  extractInterwellPlasticSamples,
  fit2dIlluminationSurfaces,
  extractOpticalFeatures,
} from './opticalEnhancer';
import { loadTreeModel, predictSingle } from './treeRegressor';
import { evaluatePlateDiagnostics } from './diagnosticEngine';

export interface AnalysisProgress {
  stage: 'idle' | 'detecting' | 'homography' | 'sampling' | 'optical' | 'inferring' | 'done' | 'error';
  message: string;
  progressPercent: number;
}

export interface FullAnalysisOutput {
  results: WellResult[];
  summary: DiagnosticsSummary;
  annotatedImageUrl: string;
  numCols: number;
  durationMs: number;
  quality?: OpticalQualityMetrics;
  metadata?: FarmMetadata;
}

export async function processPlateImage(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  numCols = 10,
  onProgress?: (p: AnalysisProgress) => void,
  metadata?: FarmMetadata
): Promise<FullAnalysisOutput> {
  const startTime = Date.now();

  const update = (stage: AnalysisProgress['stage'], message: string, progressPercent: number) => {
    onProgress?.({ stage, message, progressPercent });
  };

  try {
    // 1. Prepare off-screen canvas & enforce landscape orientation (12 cols horizontal, 8 rows vertical)
    update('detecting', 'Normalizing landscape orientation & running YOLOv8 on-device...', 15);
    const isPortrait = imageSource.height > imageSource.width;
    const origW = imageSource.width;
    const origH = imageSource.height;

    let targetW = isPortrait ? origH : origW;
    let targetH = isPortrait ? origW : origH;

    // Scale down if image is huge (e.g. > 1600px) to conserve mobile memory
    const maxDim = 1600;
    if (Math.max(targetW, targetH) > maxDim) {
      const scale = maxDim / Math.max(targetW, targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    if (isPortrait) {
      // Rotate 90 degrees clockwise into canonical landscape
      ctx.translate(targetW / 2, targetH / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(imageSource, -targetH / 2, -targetW / 2, targetH, targetW);
    } else {
      ctx.drawImage(imageSource, 0, 0, targetW, targetH);
    }

    const width = targetW;
    const height = targetH;

    // 2. YOLO Detection
    const rawBoxes = await detectWellsYolo(canvas, 0.25);

    // 3. Regularize grid with RANSAC Projective Homography
    update('homography', 'Fitting 8-DOF Projective Homography lattice...', 35);
    const wellCoords = regularizeWellGrid(rawBoxes, numCols, width, height);

    // 4. Sample inter-well plastic reference
    update('sampling', 'Sampling in-scene virgin polystyrene nodes...', 50);
    const imgData = ctx.getImageData(0, 0, width, height);
    const plasticSamples = extractInterwellPlasticSamples(imgData, wellCoords, numCols);

    // 5. Extract glare-trimmed pixels & crops
    update('optical', 'Extracting glare-trimmed liquid cores...', 65);
    const wellData: Record<string, any> = {};
    const wellCrops: Record<string, string> = {};

    for (const [key, coord] of Object.entries(wellCoords)) {
      const pix = getTrimmedWellPixels(imgData, coord.cx, coord.cy, coord.radius, 10);
      if (pix) {
        wellData[key] = pix;

        // Generate tiny square thumbnail crop
        const cropCanvas = document.createElement('canvas');
        const cropSize = Math.round(coord.radius * 2.4);
        cropCanvas.width = cropSize;
        cropCanvas.height = cropSize;
        const cropCtx = cropCanvas.getContext('2d')!;
        cropCtx.drawImage(
          canvas,
          coord.cx - cropSize / 2,
          coord.cy - cropSize / 2,
          cropSize,
          cropSize,
          0,
          0,
          cropSize,
          cropSize
        );
        wellCrops[key] = cropCanvas.toDataURL('image/jpeg', 0.85);
      }
    }

    // 6. Fit 2D Illumination Surface
    const surfaces = fit2dIlluminationSurfaces(wellData, plasticSamples);

    // 7. Extract 33 Optical Physics Features
    update('inferring', 'Extracting 33 optical features & running ExtraTrees...', 80);
    const featureRecords = extractOpticalFeatures(wellData, surfaces, plasticSamples);

    // 8. On-Device Tree Inference
    const treeModel = await loadTreeModel();
    const rawResults = featureRecords.map((f) => {
      const predOd = predictSingle(f.features, treeModel);
      const coord = wellCoords[`${f.row}_${f.col}`];
      return {
        row: f.row,
        col: f.col,
        predictedOd: predOd,
        cx: coord?.cx ?? 0,
        cy: coord?.cy ?? 0,
        radius: coord?.radius ?? 20,
        cropDataUrl: wellCrops[`${f.row}_${f.col}`],
        features: f.features,
      };
    });

    // 9. Clinical Diagnostics & Cut-off
    const { results, summary } = evaluatePlateDiagnostics(rawResults);

    // 10. Draw annotated overlay image
    const visCanvas = document.createElement('canvas');
    visCanvas.width = width;
    visCanvas.height = height;
    const visCtx = visCanvas.getContext('2d')!;
    visCtx.drawImage(canvas, 0, 0);

    for (const w of results) {
      visCtx.beginPath();
      visCtx.arc(w.cx, w.cy, w.radius, 0, 2 * Math.PI);
      visCtx.lineWidth = Math.max(2, Math.round(w.radius * 0.12));
      visCtx.strokeStyle = w.status === 'POSITIVE' ? '#EF4444' : w.status === 'BORDERLINE' ? '#F59E0B' : '#10B981';
      visCtx.stroke();

      // Text label
      visCtx.fillStyle = '#FFFFFF';
      visCtx.font = `bold ${Math.round(w.radius * 0.45)}px sans-serif`;
      visCtx.textAlign = 'center';
      visCtx.textBaseline = 'middle';
      visCtx.fillText(`${w.predictedOd.toFixed(2)}`, w.cx, w.cy);
    }

    const annotatedImageUrl = visCanvas.toDataURL('image/jpeg', 0.85);
    const durationMs = Date.now() - startTime;

    // 11. Compute optical illumination & geometry quality metrics
    let tiltDegrees = 0;
    if (rawBoxes.length >= 8) {
      const cys = rawBoxes.map((b) => b.cy);
      const cxs = rawBoxes.map((b) => b.cx);
      const dy = Math.max(...cys) - Math.min(...cys);
      const dx = Math.max(...cxs) - Math.min(...cxs);
      const ratio = dy / Math.max(dx, 1);
      tiltDegrees = Math.round(Math.abs(ratio - (8 / 12)) * 15 * 10) / 10;
    }

    const lockedWells = results.length;
    let uniformityScore = 92;
    if (plasticSamples.length >= 10) {
      const bVals = plasticSamples.map((p) => p.b);
      const meanB = bVals.reduce((a, b) => a + b, 0) / bVals.length;
      const stdB = Math.sqrt(
        bVals.map((x) => Math.pow(x - meanB, 2)).reduce((a, b) => a + b, 0) / bVals.length
      );
      const cov = (stdB / Math.max(meanB, 1)) * 100;
      uniformityScore = Math.max(65, Math.min(99, Math.round(100 - cov)));
    }

    let qualityGrade: OpticalQualityMetrics['qualityGrade'] = 'EXCELLENT';
    if (uniformityScore >= 88 && tiltDegrees <= 4) {
      qualityGrade = 'EXCELLENT';
    } else if (uniformityScore >= 75 && tiltDegrees <= 8) {
      qualityGrade = 'GOOD';
    } else {
      qualityGrade = 'FAIR';
    }

    const quality: OpticalQualityMetrics = {
      uniformityScore,
      glareTrimPercent: 20,
      tiltAngleDegrees: tiltDegrees,
      wellsLockedCount: lockedWells,
      qualityGrade,
    };

    update('done', `Analysis complete in ${(durationMs / 1000).toFixed(1)}s!`, 100);

    return {
      results,
      summary,
      annotatedImageUrl,
      numCols,
      durationMs,
      quality,
      metadata,
    };
  } catch (err: any) {
    update('error', err.message || 'Analysis failed', 0);
    throw err;
  }
}
