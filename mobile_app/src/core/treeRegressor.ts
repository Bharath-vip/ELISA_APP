import type { ExtraTreesModelPayload } from './types';

let cachedModel: ExtraTreesModelPayload | null = null;

export async function loadTreeModel(): Promise<ExtraTreesModelPayload> {
  if (cachedModel) return cachedModel;
  
  const res = await fetch('/models/extra_trees_model.json');
  if (!res.ok) {
    throw new Error(`Failed to load extra_trees_model.json: ${res.statusText}`);
  }
  cachedModel = (await res.json()) as ExtraTreesModelPayload;
  return cachedModel;
}

export function predictSingle(
  featureMap: Record<string, number>,
  model: ExtraTreesModelPayload
): number {
  const featureCols = model.features;
  const numCols = featureCols.length;
  
  // Pack features into float array
  const x = new Float64Array(numCols);
  for (let i = 0; i < numCols; i++) {
    x[i] = featureMap[featureCols[i]] ?? 0.0;
  }
  
  const trees = model.trees;
  const numTrees = trees.length;
  let treeSum = 0.0;
  
  for (let i = 0; i < numTrees; i++) {
    const t = trees[i];
    let node = 0;
    while (t.children_left[node] !== -1) {
      const featIdx = t.feature[node];
      const thresh = t.threshold[node];
      if (x[featIdx] <= thresh) {
        node = t.children_left[node];
      } else {
        node = t.children_right[node];
      }
    }
    treeSum += t.value[node];
  }
  
  let pred = treeSum / numTrees;
  if (model.target_transform === 'log') {
    pred = Math.exp(pred);
  }
  
  return Math.min(Math.max(pred, 0.04), 6.0);
}

export function predictBatch(
  featureMaps: Record<string, number>[],
  model: ExtraTreesModelPayload
): number[] {
  return featureMaps.map((f) => predictSingle(f, model));
}
