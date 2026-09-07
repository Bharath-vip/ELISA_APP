export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type RowLetter = typeof ROWS[number];

export interface WellCoord {
  row: RowLetter;
  col: number;
  cx: number;
  cy: number;
  radius: number;
}

export interface WellPixelData {
  cx: number;
  cy: number;
  b: number;
  g: number;
  r: number;
  l_med: number;
  a_med: number;
  b_star: number;
  s_med: number;
  v_med: number;
  core_blue: number;
  meniscus_depth_ratio: number;
}

export interface PlasticSample {
  cx: number;
  cy: number;
  b: number;
  g: number;
  r: number;
}

export interface SurfaceModel {
  eval: (x: number, y: number) => number;
}

export interface Surfaces {
  blue: SurfaceModel;
  green: SurfaceModel;
  red: SurfaceModel;
  lstar: SurfaceModel;
  bstar: SurfaceModel;
  sat: SurfaceModel;
  core_blue: SurfaceModel;
}

export interface WellResult {
  row: RowLetter;
  col: number;
  predictedOd: number;
  trueOd?: number | null;
  status: 'POSITIVE' | 'NEGATIVE' | 'BORDERLINE';
  features?: Record<string, number>;
  cropDataUrl?: string;
  cx: number;
  cy: number;
  radius: number;
}

export interface DiagnosticsSummary {
  totalWells: number;
  positiveCount: number;
  negativeCount: number;
  cutoffValue: number;
  meanNeg: number;
  sdNeg: number;
  outbreakAlert: boolean;
}

export interface DecisionTree {
  children_left: number[];
  children_right: number[];
  feature: number[];
  threshold: number[];
  value: number[];
}

export interface ExtraTreesModelPayload {
  n_estimators: number;
  features: string[];
  target_transform: string;
  train_plates: string[];
  test_plates: string[];
  trees: DecisionTree[];
}
