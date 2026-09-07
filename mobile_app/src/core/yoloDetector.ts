import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime Web WASM paths
ort.env.wasm.numThreads = 2;
ort.env.wasm.simd = true;

let session: ort.InferenceSession | null = null;

export async function loadYoloModel(): Promise<ort.InferenceSession> {
  if (session) return session;

  try {
    session = await ort.InferenceSession.create('/models/yolov8_wssa_wells.onnx', {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    return session;
  } catch (err) {
    console.error('Failed to create ONNX session with wasm provider:', err);
    throw err;
  }
}

export interface RawBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  score: number;
}

export async function detectWellsYolo(
  canvas: HTMLCanvasElement,
  confThreshold = 0.25
): Promise<RawBox[]> {
  const model = await loadYoloModel();
  const origW = canvas.width;
  const origH = canvas.height;

  // 1. 640x640 Letterbox
  const scale = Math.min(640.0 / origW, 640.0 / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const dx = Math.floor((640 - newW) / 2);
  const dy = Math.floor((640 - newH) / 2);

  const letterboxCanvas = document.createElement('canvas');
  letterboxCanvas.width = 640;
  letterboxCanvas.height = 640;
  const ctx = letterboxCanvas.getContext('2d', { willReadFrequently: true })!;

  // Fill padding with color 114
  ctx.fillStyle = 'rgb(114, 114, 114)';
  ctx.fillRect(0, 0, 640, 640);
  ctx.drawImage(canvas, 0, 0, origW, origH, dx, dy, newW, newH);

  const imgData = ctx.getImageData(0, 0, 640, 640);
  const data = imgData.data;

  // 2. Transpose RGB HWC -> CHW float32 tensor normalized to [0, 1]
  const float32Data = new Float32Array(3 * 640 * 640);
  for (let i = 0; i < 640 * 640; i++) {
    const r = data[i * 4] / 255.0;
    const g = data[i * 4 + 1] / 255.0;
    const b = data[i * 4 + 2] / 255.0;

    float32Data[i] = r;                  // Channel 0 (R)
    float32Data[640 * 640 + i] = g;      // Channel 1 (G)
    float32Data[2 * 640 * 640 + i] = b;  // Channel 2 (B)
  }

  const tensor = new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
  const inputName = model.inputNames[0];
  const feeds: Record<string, ort.Tensor> = {};
  feeds[inputName] = tensor;

  const results = await model.run(feeds);
  const outputTensor = results[model.outputNames[0]];
  const outData = outputTensor.data as Float32Array; // shape: [1, 5, 8400]

  // Parse candidate boxes
  const rawBoxes: RawBox[] = [];
  for (let i = 0; i < 8400; i++) {
    const score = outData[4 * 8400 + i];
    if (score >= confThreshold) {
      const cx_lb = outData[i];
      const cy_lb = outData[8400 + i];
      const w_lb = outData[2 * 8400 + i];
      const h_lb = outData[3 * 8400 + i];

      // Map back from letterbox to original image
      const cx = (cx_lb - dx) / scale;
      const cy = (cy_lb - dy) / scale;
      const w = w_lb / scale;
      const h = h_lb / scale;

      rawBoxes.push({ cx, cy, w, h, score });
    }
  }

  // Non-Maximum Suppression (NMS with IoU 0.30)
  return nms(rawBoxes, 0.30);
}

function nms(boxes: RawBox[], iouThreshold: number): RawBox[] {
  boxes.sort((a, b) => b.score - a.score);
  const selected: RawBox[] = [];

  for (const b of boxes) {
    let keep = true;
    for (const s of selected) {
      if (calculateIoU(b, s) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) selected.push(b);
  }
  return selected;
}

function calculateIoU(b1: RawBox, b2: RawBox): number {
  const x1_a = b1.cx - b1.w / 2;
  const y1_a = b1.cy - b1.h / 2;
  const x2_a = b1.cx + b1.w / 2;
  const y2_a = b1.cy + b1.h / 2;

  const x1_b = b2.cx - b2.w / 2;
  const y1_b = b2.cy - b2.h / 2;
  const x2_b = b2.cx + b2.w / 2;
  const y2_b = b2.cy + b2.h / 2;

  const interX1 = Math.max(x1_a, x1_b);
  const interY1 = Math.max(y1_a, y1_b);
  const interX2 = Math.min(x2_a, x2_b);
  const interY2 = Math.min(y2_a, y2_b);

  const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  const areaA = b1.w * b1.h;
  const areaB = b2.w * b2.h;

  return interArea / (areaA + areaB - interArea + 1e-6);
}
