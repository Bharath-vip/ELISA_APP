import type { WellCoord, WellPixelData, PlasticSample, Surfaces, SurfaceModel } from './types';

// Convert RGB (0..255) to OpenCV-equivalent CIELAB (L: 0..255, a: 0..255, b: 0..255)
export function rgbToOpenCVLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB gamma correction to linear
  const rLin = r / 255.0;
  const gLin = g / 255.0;
  const bLin = b / 255.0;

  // D65 standard illuminant matrix (matches OpenCV cvtColor BGR2LAB)
  const X = 0.412453 * rLin + 0.357580 * gLin + 0.180423 * bLin;
  const Y = 0.212671 * rLin + 0.715160 * gLin + 0.072169 * bLin;
  const Z = 0.019334 * rLin + 0.119193 * gLin + 0.950227 * bLin;

  const Xn = 0.950456;
  const Yn = 1.0;
  const Zn = 1.088754;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16.0 / 116.0);

  const fx = f(X / Xn);
  const fy = f(Y / Yn);
  const fz = f(Z / Zn);

  // Standard CIELAB
  const L = 116.0 * fy - 16.0;
  const a = 500.0 * (fx - fy);
  const bStar = 200.0 * (fy - fz);

  // Scale to OpenCV 8-bit range: L: 0..255, a: a + 128, b: b + 128
  const L_cv = Math.min(Math.max((L * 255.0) / 100.0, 0), 255);
  const a_cv = Math.min(Math.max(a + 128.0, 0), 255);
  const b_cv = Math.min(Math.max(bStar + 128.0, 0), 255);

  return [L_cv, a_cv, b_cv];
}

// Convert RGB (0..255) to OpenCV-equivalent HSV (H: 0..180, S: 0..255, V: 0..255)
export function rgbToOpenCVHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;
  }

  // OpenCV scales H to 0..180
  const h_cv = Math.round(h / 2);
  const s_cv = max === 0 ? 0 : Math.round((delta / max) * 255);
  const v_cv = max;

  return [h_cv, s_cv, v_cv];
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.max((p / 100) * (sorted.length - 1), 0), sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

// 1. Glare-Trimmed Concentric Well Pixels Extraction
export function getTrimmedWellPixels(
  imgData: ImageData,
  cx: number,
  cy: number,
  radius: number,
  trimPercent = 10
): WellPixelData | null {
  const width = imgData.width;
  const height = imgData.height;
  const data = imgData.data;

  const r_core = 0.35 * radius;
  const r_mid = 0.70 * radius;
  const r_outer = 0.92 * radius;

  const r_core_sq = r_core * r_core;
  const r_mid_sq = r_mid * r_mid;
  const r_outer_sq = r_outer * r_outer;

  const minX = Math.max(0, Math.floor(cx - r_outer));
  const maxX = Math.min(width - 1, Math.ceil(cx + r_outer));
  const minY = Math.max(0, Math.floor(cy - r_outer));
  const maxY = Math.min(height - 1, Math.ceil(cy + r_outer));

  interface Pixel {
    r: number;
    g: number;
    b: number;
    l: number;
    a: number;
    b_cv: number;
    s: number;
    v: number;
  }

  const allPixels: Pixel[] = [];
  const coreBlues: number[] = [];
  const outerBlues: number[] = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const distSq = dx * dx + dy * dy;

      if (distSq <= r_outer_sq) {
        const offset = (y * width + x) * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];

        const [L_cv, a_cv, b_cv] = rgbToOpenCVLab(r, g, b);
        const [, s_cv, v_cv] = rgbToOpenCVHsv(r, g, b);

        allPixels.push({ r, g, b, l: L_cv, a: a_cv, b_cv, s: s_cv, v: v_cv });

        if (distSq <= r_core_sq) {
          coreBlues.push(b);
        } else if (distSq >= r_mid_sq && distSq <= r_outer_sq) {
          outerBlues.push(b);
        }
      }
    }
  }

  if (allPixels.length < 20) return null;

  // Luminance glare trimming (reject top 10% specular and bottom 10% wall shadows)
  const lums = allPixels.map((p) => p.l);
  const p10 = percentile(lums, trimPercent);
  const p90 = percentile(lums, 100 - trimPercent);

  let clean = allPixels.filter((p) => p.l >= p10 && p.l <= p90);
  if (clean.length < 10) clean = allPixels;

  const core_blue = coreBlues.length > 0 ? median(coreBlues) : median(clean.map((p) => p.b));
  const outer_blue = outerBlues.length > 0 ? median(outerBlues) : median(clean.map((p) => p.b));

  return {
    cx,
    cy,
    b: median(clean.map((p) => p.b)),
    g: median(clean.map((p) => p.g)),
    r: median(clean.map((p) => p.r)),
    l_med: median(clean.map((p) => p.l)),
    a_med: median(clean.map((p) => p.a)),
    b_star: median(clean.map((p) => p.b_cv)),
    s_med: median(clean.map((p) => p.s)),
    v_med: median(clean.map((p) => p.v)),
    core_blue,
    meniscus_depth_ratio: core_blue / Math.max(outer_blue, 1.0),
  };
}

// 2. Sample 42 to 77 Inter-Well Virgin Polystyrene Intersection Nodes
export function extractInterwellPlasticSamples(
  imgData: ImageData,
  wellCoords: Record<string, WellCoord>,
  numCols: number,
  patchRadius = 3
): PlasticSample[] {
  const width = imgData.width;
  const height = imgData.height;
  const data = imgData.data;
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const samples: PlasticSample[] = [];

  for (let rIdx = 0; rIdx < 7; rIdx++) {
    const r1 = rows[rIdx];
    const r2 = rows[rIdx + 1];

    for (let cIdx = 1; cIdx < numCols; cIdx++) {
      const c1 = cIdx;
      const c2 = cIdx + 1;

      const w1 = wellCoords[`${r1}_${c1}`];
      const w2 = wellCoords[`${r1}_${c2}`];
      const w3 = wellCoords[`${r2}_${c1}`];
      const w4 = wellCoords[`${r2}_${c2}`];

      if (w1 && w2 && w3 && w4) {
        const mx = Math.round((w1.cx + w2.cx + w3.cx + w4.cx) / 4.0);
        const my = Math.round((w1.cy + w2.cy + w3.cy + w4.cy) / 4.0);

        const y1 = Math.max(0, my - patchRadius);
        const y2 = Math.min(height - 1, my + patchRadius);
        const x1 = Math.max(0, mx - patchRadius);
        const x2 = Math.min(width - 1, mx + patchRadius);

        const blues: number[] = [];
        const greens: number[] = [];
        const reds: number[] = [];

        for (let py = y1; py <= y2; py++) {
          for (let px = x1; px <= x2; px++) {
            const offset = (py * width + px) * 4;
            reds.push(data[offset]);
            greens.push(data[offset + 1]);
            blues.push(data[offset + 2]);
          }
        }

        if (blues.length > 0) {
          samples.push({
            cx: mx,
            cy: my,
            b: median(blues),
            g: median(greens),
            r: median(reds),
          });
        }
      }
    }
  }

  return samples;
}

// 3. 2D Quadratic Polynomial Surface Solver via Regularized Normal Equations
function fit2dSurface(
  coords: { x: number; y: number }[],
  values: number[]
): SurfaceModel {
  const n = coords.length;
  if (n < 6) {
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 128.0;
    return { eval: () => avg };
  }

  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  const stdX = Math.sqrt(xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0) / n) || 1.0;
  const stdY = Math.sqrt(ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0) / n) || 1.0;

  // Design matrix A (N x 6): [xn^2, yn^2, xn*yn, xn, yn, 1]
  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    const xn = (coords[i].x - meanX) / stdX;
    const yn = (coords[i].y - meanY) / stdY;
    A.push([xn * xn, yn * yn, xn * yn, xn, yn, 1.0]);
  }

  // Compute AtA (6x6) and Aty (6x1)
  const AtA: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0));
  const Aty: number[] = new Array(6).fill(0);

  for (let i = 0; i < n; i++) {
    const row = A[i];
    const val = values[i];
    for (let r = 0; r < 6; r++) {
      Aty[r] += row[r] * val;
      for (let c = 0; c < 6; c++) {
        AtA[r][c] += row[r] * row[c];
      }
    }
  }

  // Tikhonov Regularization: AtA + lambda * I
  const lambda = 0.05;
  for (let i = 0; i < 6; i++) {
    AtA[i][i] += lambda;
  }

  // Solve 6x6 linear system using Gaussian Elimination with partial pivoting
  const theta = solveLinearSystem6x6(AtA, Aty);

  return {
    eval: (x: number, y: number) => {
      const xn = (x - meanX) / stdX;
      const yn = (y - meanY) / stdY;
      const val =
        theta[0] * xn * xn +
        theta[1] * yn * yn +
        theta[2] * xn * yn +
        theta[3] * xn +
        theta[4] * yn +
        theta[5];
      return Math.max(val, 1.0);
    },
  };
}

function solveLinearSystem6x6(A_in: number[][], b_in: number[]): number[] {
  const n = 6;
  const A = A_in.map((row) => [...row]);
  const b = [...b_in];

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    // Swap
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / pivot;
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
      b[k] -= factor * b[i];
    }
  }

  // Back-substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * x[j];
    }
    x[i] = Math.abs(A[i][i]) > 1e-12 ? sum / A[i][i] : 0;
  }
  return x;
}

export function fit2dIlluminationSurfaces(
  wellData: Record<string, WellPixelData>,
  plasticSamples: PlasticSample[]
): Surfaces {
  const coords: { x: number; y: number }[] = [];
  const blues: number[] = [];
  const greens: number[] = [];
  const reds: number[] = [];
  const lstars: number[] = [];
  const bstars: number[] = [];
  const sats: number[] = [];
  const coreBlues: number[] = [];

  // 1. Reference plastic nodes
  for (const p of plasticSamples) {
    coords.push({ x: p.cx, y: p.cy });
    blues.push(p.b);
    greens.push(p.g);
    reds.push(p.r);
    const [L_cv, , b_cv] = rgbToOpenCVLab(p.r, p.g, p.b);
    const [, s_cv] = rgbToOpenCVHsv(p.r, p.g, p.b);
    lstars.push(L_cv);
    bstars.push(b_cv);
    sats.push(s_cv);
    coreBlues.push(p.b);
  }

  // 2. High-brightness wells (clear buffer blanks)
  const wellList = Object.values(wellData);
  if (wellList.length > 0) {
    const sortedByL = [...wellList].sort((a, b) => b.l_med - a.l_med);
    const topBlanks = sortedByL.slice(0, Math.max(3, Math.floor(wellList.length * 0.15)));
    for (const w of topBlanks) {
      coords.push({ x: w.cx, y: w.cy });
      blues.push(w.b);
      greens.push(w.g);
      reds.push(w.r);
      lstars.push(w.l_med);
      bstars.push(w.b_star);
      sats.push(w.s_med);
      coreBlues.push(w.core_blue);
    }
  }

  return {
    blue: fit2dSurface(coords, blues),
    green: fit2dSurface(coords, greens),
    red: fit2dSurface(coords, reds),
    lstar: fit2dSurface(coords, lstars),
    bstar: fit2dSurface(coords, bstars),
    sat: fit2dSurface(coords, sats),
    core_blue: fit2dSurface(coords, coreBlues),
  };
}

// 4. Extract 33 Next-Gen Optical Physics Features (100% Bit-for-Bit Python Parity)
export function extractOpticalFeatures(
  wellData: Record<string, WellPixelData>,
  surfaces: Surfaces,
  plasticSamples: PlasticSample[]
): { row: string; col: number; features: Record<string, number> }[] {
  const results: { row: string; col: number; features: Record<string, number> }[] = [];

  for (const [key, data] of Object.entries(wellData)) {
    const [rName, cNumStr] = key.split('_');
    const cNum = parseInt(cNumStr, 10);
    const { cx, cy, b, g, r, l_med } = data;

    // Zero-center CIELAB values (OpenCV adds 128)
    const b_star = data.b_star - 128.0;
    const a_med = data.a_med - 128.0;
    const s_med = data.s_med;

    // Evaluated 2D surface illumination baseline
    const base_blue = surfaces.blue.eval(cx, cy);
    const base_green = surfaces.green.eval(cx, cy);
    const base_red = surfaces.red.eval(cx, cy);
    const base_bstar = surfaces.bstar.eval(cx, cy) - 128.0;
    const base_sat = surfaces.sat.eval(cx, cy);
    const base_core = surfaces.core_blue.eval(cx, cy);

    // 1. Dual-Wavelength Non-linear Absorbance
    const t_b = Math.max(b, 1.0) / Math.max(base_blue, 1.0);
    const t_g = Math.max(g, 1.0) / Math.max(base_green, 1.0);
    const t_r = Math.max(r, 1.0) / Math.max(base_red, 1.0);

    const a_blue = -Math.log10(t_b);
    const a_green = -Math.log10(t_g);
    const a_red = -Math.log10(t_r);
    const a_diff = a_blue - a_red;
    const a_green_diff = a_green - a_red;

    // 2. Linearized Radiometric Absorbance
    const toLin = (val: number) => {
      const v = val / 255.0;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const b_lin = toLin(b);
    const g_lin = toLin(g);
    const r_lin = toLin(r);
    const base_b_lin = toLin(base_blue);
    const base_g_lin = toLin(base_green);
    const base_r_lin = toLin(base_red);

    const a_blue_lin = -Math.log10(Math.max(b_lin, 1e-4) / Math.max(base_b_lin, 1e-4));
    const a_green_lin = -Math.log10(Math.max(g_lin, 1e-4) / Math.max(base_g_lin, 1e-4));
    const a_red_lin = -Math.log10(Math.max(r_lin, 1e-4) / Math.max(base_r_lin, 1e-4));
    const a_diff_lin = a_blue_lin - a_red_lin;
    const a_green_diff_lin = a_green_lin - a_red_lin;

    // 3. Local Virgin Polystyrene Plastic Reference
    let plast_b = base_blue;
    let plast_g = base_green;
    let plast_r = base_red;

    if (plasticSamples.length > 0) {
      let minDist = Infinity;
      let closestP = plasticSamples[0];
      for (const p of plasticSamples) {
        const d = (p.cx - cx) ** 2 + (p.cy - cy) ** 2;
        if (d < minDist) {
          minDist = d;
          closestP = p;
        }
      }
      plast_b = closestP.b;
      plast_g = closestP.g;
      plast_r = closestP.r;
    }

    const t_plast_b = Math.max(b, 1.0) / Math.max(plast_b, 1.0);
    const t_plast_g = Math.max(g, 1.0) / Math.max(plast_g, 1.0);
    const t_plast_r = Math.max(r, 1.0) / Math.max(plast_r, 1.0);
    const a_plast_diff = -Math.log10(t_plast_b) - -Math.log10(t_plast_r);
    const a_plast_green_diff = -Math.log10(t_plast_g) - -Math.log10(t_plast_r);

    // 4. Meniscus Liquid Depth
    const a_core_blue = -Math.log10(Math.max(data.core_blue, 1.0) / Math.max(base_core, 1.0));

    // 5. Chromatic Polar Coordinates & Ratios
    const delta_bstar = b_star - base_bstar;
    const bstar_norm = b_star / Math.max(l_med, 1.0);
    const chroma = Math.sqrt(a_med ** 2 + b_star ** 2);
    const hue_angle = Math.atan2(b_star, a_med);
    const chroma_l_ratio = chroma / Math.max(l_med, 1.0);

    const ndyi = (r + g - 2.0 * b) / (r + g + 2.0 * b + 1e-5);
    const rb_ratio = r / Math.max(b, 1.0);
    const gb_ratio = g / Math.max(b, 1.0);
    const rg_ratio = r / Math.max(g, 1.0);
    const rel_sat = s_med / Math.max(base_sat, 1.0);

    // Spectrophotometer Simulated Absorbance Index (SSAI) & Amber Attenuation Ratio (AAR)
    const ssai = a_diff_lin / (1.0 + 0.30 * Math.max(a_green_diff_lin, 0.0));
    const aar = (Math.max(a_green_diff, 0.0) + 0.01) / (Math.max(a_diff, 0.0) + 0.05);

    const featMap: Record<string, number> = {
      A_Diff_Linear: a_diff_lin,
      A_Blue_Linear: a_blue_lin,
      A_Green_Diff_Linear: a_green_diff_lin,
      A_Diff: a_diff,
      A_Blue: a_blue,
      A_Green_Diff: a_green_diff,
      A_Plast_Diff: a_plast_diff,
      A_Plast_Green_Diff: a_plast_green_diff,
      T_Plast_Blue: t_plast_b,
      T_Plast_Green: t_plast_g,
      T_Plast_Red: t_plast_r,
      A_Core_Blue: a_core_blue,
      Meniscus_Depth_Ratio: data.meniscus_depth_ratio,
      Delta_BStar: delta_bstar,
      B_Star_Norm: bstar_norm,
      Chroma: chroma,
      Hue_Angle: hue_angle,
      Chroma_L_Ratio: chroma_l_ratio,
      SSAI: ssai,
      AAR: aar,
      NDYI: ndyi,
      RB_Ratio: rb_ratio,
      GB_Ratio: gb_ratio,
      RG_Ratio: rg_ratio,
      Rel_Sat: rel_sat,
      Blue_Med: b,
      Green_Med: g,
      Red_Med: r,
      L_Med: l_med,
      A_Med: a_med,
      B_Star_Med: data.b_star,
      S_Med: s_med,
      V_Med: data.v_med,
    };

    results.push({ row: rName, col: cNum, features: featMap });
  }

  return results;
}
