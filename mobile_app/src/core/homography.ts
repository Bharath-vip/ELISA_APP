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

// Full Regularization: Match detections to ANSI lattice and project all 96 wells
export function regularizeWellGrid(
  rawDetections: { cx: number; cy: number; w: number; h: number }[],
  numCols: number,
  imgWidth: number,
  imgHeight: number
): Record<string, WellCoord> {
  const wellCoords: Record<string, WellCoord> = {};

  if (rawDetections.length < 15) {
    // Fallback: Uniform ANSI grid
    const marginX = imgWidth * 0.08;
    const marginY = imgHeight * 0.08;
    const stepX = (imgWidth - 2 * marginX) / (numCols - 1);
    const stepY = (imgHeight - 2 * marginY) / 7;
    const radius = Math.round(stepX * 0.40);

    for (let r = 0; r < 8; r++) {
      const rowLetter = ROWS[r];
      for (let c = 0; c < numCols; c++) {
        wellCoords[`${rowLetter}_${c + 1}`] = {
          row: rowLetter,
          col: c + 1,
          cx: Math.round(marginX + c * stepX),
          cy: Math.round(marginY + r * stepY),
          radius,
        };
      }
    }
    return wellCoords;
  }

  // Filter aspect ratios (0.70 .. 1.40)
  const okDetections = rawDetections.filter((d) => {
    const ar = d.w / Math.max(d.h, 1e-3);
    return ar >= 0.70 && ar <= 1.40;
  });

  const validDets = okDetections.length >= 15 ? okDetections : rawDetections;
  const avgW = validDets.reduce((a, b) => a + b.w, 0) / validDets.length;
  const avgH = validDets.reduce((a, b) => a + b.h, 0) / validDets.length;
  const D = (avgW + avgH) / 2.0;
  const innerRadius = Math.round(0.40 * D);

  const cxs = validDets.map((d) => d.cx);
  const cys = validDets.map((d) => d.cy);

  // Cluster 8 row centers via K-means
  const minY = Math.min(...cys);
  const maxY = Math.max(...cys);
  let rowCenters = Array.from({ length: 8 }, (_, i) => minY + (i / 7) * (maxY - minY));

  // 10 K-means iterations
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

  const diffs: number[] = [];
  for (let i = 0; i < 7; i++) diffs.push(rowCenters[i + 1] - rowCenters[i]);
  const rowPitch = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const colPitch = rowPitch;

  const minX = Math.min(...cxs);
  const colCenters = Array.from({ length: numCols }, (_, c) => minX + c * colPitch);

  // Match detections to nearest (r, c)
  const gridPts: { r: number; c: number }[] = [];
  const pixelPts: { x: number; y: number }[] = [];

  for (const det of validDets) {
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
    for (let c = 0; c < numCols; c++) {
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
      for (let c = 0; c < numCols; c++) {
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
    return wellCoords;
  }

  // Robust Affine fallback
  for (let r = 0; r < 8; r++) {
    const rowLetter = ROWS[r];
    for (let c = 0; c < numCols; c++) {
      wellCoords[`${rowLetter}_${c + 1}`] = {
        row: rowLetter,
        col: c + 1,
        cx: Math.round(minX + c * colPitch),
        cy: Math.round(rowCenters[r]),
        radius: innerRadius,
      };
    }
  }

  return wellCoords;
}
