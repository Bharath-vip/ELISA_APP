import { ROWS, type WellCoord } from './types';

// Compute 3x3 Homography matrix from 4 corresponding point pairs
export function findHomography4Points(
  src: { x: number; y: number }[],
  dst: { x: number; y: number }[]
): number[][] | null {
  // 8x8 system of equations
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x: X, y: Y } = src[i];
    const { x: u, y: v } = dst[i];

    A.push([X, Y, 1, 0, 0, 0, -X * u, -Y * u]);
    b.push(u);

    A.push([0, 0, 0, X, Y, 1, -X * v, -Y * v]);
    b.push(v);
  }

  // Gaussian elimination
  const h = solveLinearSystem8x8(A, b);
  if (!h) return null;

  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1.0],
  ];
}

function solveLinearSystem8x8(A_in: number[][], b_in: number[]): number[] | null {
  const n = 8;
  const A = A_in.map((row) => [...row]);
  const b = [...b_in];

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    if (Math.abs(A[maxRow][i]) < 1e-12) return null;

    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    const pivot = A[i][i];
    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / pivot;
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
      b[k] -= factor * b[i];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * x[j];
    }
    x[i] = sum / A[i][i];
  }
  return x;
}

export function projectPoint(H: number[][], x: number, y: number): [number, number] {
  const w = H[2][0] * x + H[2][1] * y + H[2][2];
  const px = (H[0][0] * x + H[0][1] * y + H[0][2]) / (Math.abs(w) > 1e-8 ? w : 1.0);
  const py = (H[1][0] * x + H[1][1] * y + H[1][2]) / (Math.abs(w) > 1e-8 ? w : 1.0);
  return [px, py];
}

export function fitRansacHomography(
  gridPoints: { r: number; c: number }[],
  pixelPoints: { x: number; y: number }[],
  tolerancePx: number,
  iterations = 600
): number[][] | null {
  const n = gridPoints.length;
  if (n < 8) return null;

  let bestInlierCount = 0;
  let bestH: number[][] | null = null;

  for (let iter = 0; iter < iterations; iter++) {
    // Pick 4 random distinct indices
    const indices: number[] = [];
    while (indices.length < 4) {
      const idx = Math.floor(Math.random() * n);
      if (!indices.includes(idx)) indices.push(idx);
    }

    const src4 = indices.map((i) => ({ x: gridPoints[i].c, y: gridPoints[i].r }));
    const dst4 = indices.map((i) => pixelPoints[i]);

    const H = findHomography4Points(src4, dst4);
    if (!H) continue;

    // Check determinant
    const det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
    if (Math.abs(det) < 1e-5 || Math.abs(det) > 1e7) continue;

    // Count inliers
    let inliers = 0;
    for (let i = 0; i < n; i++) {
      const [px, py] = projectPoint(H, gridPoints[i].c, gridPoints[i].r);
      const dist = Math.hypot(px - pixelPoints[i].x, py - pixelPoints[i].y);
      if (dist <= tolerancePx) inliers++;
    }

    if (inliers > bestInlierCount) {
      bestInlierCount = inliers;
      bestH = H;
    }
  }

  return bestInlierCount >= 12 ? bestH : null;
}

export interface GridRegularizationResult {
  wellCoords: Record<string, WellCoord>;
  numCols: number;
}

// Full Regularization: Match detections to ANSI lattice and dynamically determine column count (up to 12)
export function regularizeWellGrid(
  rawDetections: { cx: number; cy: number; w: number; h: number }[],
  targetNumCols: number | undefined,
  imgWidth: number,
  imgHeight: number
): GridRegularizationResult {
  const wellCoords: Record<string, WellCoord> = {};

  // 1. Initial aspect ratio filter (0.70 .. 1.40)
  const okDetections = rawDetections.filter((d) => {
    const ar = d.w / Math.max(d.h, 1e-3);
    return ar >= 0.70 && ar <= 1.40;
  });

  if (okDetections.length < 15 && rawDetections.length < 15) {
    // Fallback: Uniform ANSI grid
    const actualCols = targetNumCols && targetNumCols >= 6 && targetNumCols <= 12 ? targetNumCols : 12;
    const marginX = imgWidth * 0.08;
    const marginY = imgHeight * 0.08;
    const stepX = (imgWidth - 2 * marginX) / (actualCols - 1);
    const stepY = (imgHeight - 2 * marginY) / 7;
    const radius = Math.round(stepX * 0.40);

    for (let r = 0; r < 8; r++) {
      const rowLetter = ROWS[r];
      for (let c = 0; c < actualCols; c++) {
        wellCoords[`${rowLetter}_${c + 1}`] = {
          row: rowLetter,
          col: c + 1,
          cx: Math.round(marginX + c * stepX),
          cy: Math.round(marginY + r * stepY),
          radius,
        };
      }
    }
    return { wellCoords, numCols: actualCols };
  }

  const validDets = okDetections.length >= 15 ? okDetections : rawDetections;
  const widths = validDets.map((d) => d.w).sort((a, b) => a - b);
  const heights = validDets.map((d) => d.h).sort((a, b) => a - b);
  const medW = widths[Math.floor(widths.length / 2)];
  const medH = heights[Math.floor(heights.length / 2)];
  const D = (medW + medH) / 2.0;
  const innerRadius = Math.round(0.40 * D);

  // Size filtering: remove outlier detections
  const sizeFiltered = validDets.filter(
    (d) =>
      d.w >= 0.55 * medW &&
      d.w <= 1.65 * medW &&
      d.h >= 0.55 * medH &&
      d.h <= 1.65 * medH
  );
  const baseDets = sizeFiltered.length >= 15 ? sizeFiltered : validDets;

  // Vertical strip density filter: wells in an 8-well strip share similar X coordinates
  const colDensity = baseDets.map(
    (di) => baseDets.filter((dj) => Math.abs(di.cx - dj.cx) < 0.40 * D).length
  );
  const stripDets = baseDets.filter((_, idx) => colDensity[idx] >= 3);
  const cleanDets = stripDets.length >= 15 ? stripDets : baseDets;

  const cxs = cleanDets.map((d) => d.cx);
  const cys = cleanDets.map((d) => d.cy);

  // Cluster 8 row centers via K-means on Y coordinates
  const minY = Math.min(...cys);
  const maxY = Math.max(...cys);
  let rowCenters = Array.from({ length: 8 }, (_, i) => minY + (i / 7) * (maxY - minY));

  for (let iter = 0; iter < 10; iter++) {
    const clusters: number[][] = Array.from({ length: 8 }, () => []);
    for (const y of cys) {
      let bestR = 0;
      let minDist = Infinity;
      for (let r = 0; r < 8; r++) {
        const dist = Math.abs(y - rowCenters[r]);
        if (dist < minDist) {
          minDist = dist;
          bestR = r;
        }
      }
      clusters[bestR].push(y);
    }
    for (let r = 0; r < 8; r++) {
      if (clusters[r].length > 0) {
        rowCenters[r] = clusters[r].reduce((a, b) => a + b, 0) / clusters[r].length;
      }
    }
  }
  rowCenters.sort((a, b) => a - b);

  const rowPitch = (rowCenters[7] - rowCenters[0]) / 7.0;

  // Auto-detect number of columns from the horizontal span of clean well detections
  const minX = Math.min(...cxs);
  const maxX = Math.max(...cxs);
  const xSpan = maxX - minX;

  const estimatedCols = Math.min(
    12,
    Math.max(6, Math.round(xSpan / Math.max(rowPitch, 1)) + 1)
  );

  // Count detections in each column bin to detect and trim empty slots
  const colPitch = xSpan / Math.max(1, estimatedCols - 1);
  const colBins = new Array(estimatedCols).fill(0);
  for (const x of cxs) {
    const cIdx = Math.round((x - minX) / Math.max(colPitch, 1));
    if (cIdx >= 0 && cIdx < estimatedCols) {
      colBins[cIdx]++;
    }
  }

  let actualCols = estimatedCols;
  // Trim trailing empty slots if fewer than 2 detections exist at the far edge
  while (actualCols > 6 && colBins[actualCols - 1] < 2) {
    actualCols--;
  }

  // If caller provided an explicit valid target column count, respect it
  if (targetNumCols && targetNumCols >= 6 && targetNumCols <= 12) {
    actualCols = targetNumCols;
  }

  const colCenters = Array.from({ length: actualCols }, (_, c) => minX + c * colPitch);

  // Match detections to nearest (r, c)
  const gridPts: { r: number; c: number }[] = [];
  const pixelPts: { x: number; y: number }[] = [];

  for (const det of cleanDets) {
    let bestR = 0;
    let minRDist = Infinity;
    for (let r = 0; r < 8; r++) {
      const d = Math.abs(det.cy - rowCenters[r]);
      if (d < minRDist) {
        minRDist = d;
        bestR = r;
      }
    }

    let bestC = 0;
    let minCDist = Infinity;
    for (let c = 0; c < actualCols; c++) {
      const d = Math.abs(det.cx - colCenters[c]);
      if (d < minCDist) {
        minCDist = d;
        bestC = c;
      }
    }

    if (minRDist <= 0.35 * rowPitch && minCDist <= 0.35 * colPitch) {
      gridPts.push({ r: bestR, c: bestC });
      pixelPts.push({ x: det.cx, y: det.cy });
    }
  }

  // Fit RANSAC Homography
  const H = fitRansacHomography(gridPts, pixelPts, 0.25 * rowPitch, 500);

  if (H) {
    for (let r = 0; r < 8; r++) {
      const rowLetter = ROWS[r];
      for (let c = 0; c < actualCols; c++) {
        const [cx, cy] = projectPoint(H, c, r);
        wellCoords[`${rowLetter}_${c + 1}`] = {
          row: rowLetter,
          col: c + 1,
          cx: Math.round(cx),
          cy: Math.round(cy),
          radius: innerRadius,
        };
      }
    }
    return { wellCoords, numCols: actualCols };
  }

  // Robust Affine fallback
  for (let r = 0; r < 8; r++) {
    const rowLetter = ROWS[r];
    for (let c = 0; c < actualCols; c++) {
      wellCoords[`${rowLetter}_${c + 1}`] = {
        row: rowLetter,
        col: c + 1,
        cx: Math.round(minX + c * colPitch),
        cy: Math.round(rowCenters[r]),
        radius: innerRadius,
      };
    }
  }

  return { wellCoords, numCols: actualCols };
}
