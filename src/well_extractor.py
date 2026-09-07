import os
import cv2
import numpy as np
from scipy.cluster.vq import kmeans
from parse_matrices import ROWS

ONNX_MODEL_PATH = r"c:\Users\bhara\projects\ELISA\models\yolov8_wssa_wells.onnx"

_cached_net = None

def get_onnx_net():
    global _cached_net
    if _cached_net is None:
        if os.path.exists(ONNX_MODEL_PATH):
            _cached_net = cv2.dnn.readNetFromONNX(ONNX_MODEL_PATH)
            _cached_net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            _cached_net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        else:
            raise FileNotFoundError(f"ONNX model not found at {ONNX_MODEL_PATH}")
    return _cached_net

def predict_yolo_onnx(bgr_img, conf_thresh=0.25):
    """
    Runs YOLOv8 inference natively using OpenCV DNN module (no PyTorch required!).
    Returns: boxes (N, 4) in xyxy format, scores (N,)
    """
    net = get_onnx_net()
    orig_h, orig_w = bgr_img.shape[:2]
    
    # 640x640 letterbox scaling
    scale = min(640.0 / orig_w, 640.0 / orig_h)
    new_w, new_h = int(orig_w * scale), int(orig_h * scale)
    resized = cv2.resize(bgr_img, (new_w, new_h))
    
    canvas = np.full((640, 640, 3), 114, dtype=np.uint8)
    dx = (640 - new_w) // 2
    dy = (640 - new_h) // 2
    canvas[dy:dy+new_h, dx:dx+new_w] = resized
    
    blob = cv2.dnn.blobFromImage(canvas, 1.0 / 255.0, (640, 640), swapRB=True, crop=False)
    net.setInput(blob)
    outputs = net.forward() # shape: (1, 5, 8400)
    
    out = outputs[0] # shape: (5, 8400)
    # rows: cx, cy, w, h, score
    scores = out[4, :]
    keep = scores > conf_thresh
    
    if not np.any(keep):
        return np.empty((0, 4)), np.empty(0)
        
    cxs = out[0, keep]
    cys = out[1, keep]
    ws = out[2, keep]
    hs = out[3, keep]
    confidences = scores[keep]
    
    # Map back from 640 canvas to original image
    cxs_orig = (cxs - dx) / scale
    cys_orig = (cys - dy) / scale
    ws_orig = ws / scale
    hs_orig = hs / scale
    
    x1s = cxs_orig - ws_orig / 2.0
    y1s = cys_orig - hs_orig / 2.0
    x2s = cxs_orig + ws_orig / 2.0
    y2s = cys_orig + hs_orig / 2.0
    
    boxes = np.column_stack([x1s, y1s, x2s, y2s])
    return boxes, confidences

def detect_plate_wells(img, num_cols):
    """
    Production-Grade Well Detection:
    1. Runs native OpenCV DNN YOLOv8 model
    2. Filters false positive pen text / margin letters
    3. Fits ANSI/SLAS square lattice grid (col_pitch == row_pitch)
    4. Returns dict {(row_letter, col_num): (center_x, center_y, radius)}
    """
    orig_h, orig_w = img.shape[:2]
    
    # 1. Run native YOLO ONNX inference
    try:
        boxes, confs = predict_yolo_onnx(img, conf_thresh=0.25)
    except Exception as e:
        print(f"ONNX prediction failed: {e}. Using geometric fallback.")
        boxes = []
        
    # Fallback if YOLO detects fewer than 15 wells
    if len(boxes) < 15:
        grid_dict = {}
        margin_x = int(orig_w * 0.08)
        margin_y = int(orig_h * 0.08)
        xs = np.linspace(margin_x, orig_w - margin_x, num_cols)
        ys = np.linspace(margin_y, orig_h - margin_y, 8)
        r = int((xs[1] - xs[0]) * 0.40)
        for r_idx, r_letter in enumerate(ROWS):
            for c_idx in range(num_cols):
                grid_dict[(r_letter, c_idx + 1)] = (int(xs[c_idx]), int(ys[r_idx]), r)
        return grid_dict

    # 2. Geometric filtering of YOLO detections
    widths = boxes[:, 2] - boxes[:, 0]
    heights = boxes[:, 3] - boxes[:, 1]
    ar = widths / np.maximum(heights, 1e-3)
    
    shape_ok = (ar >= 0.70) & (ar <= 1.40)
    med_w = np.median(widths[shape_ok]) if np.any(shape_ok) else np.median(widths)
    med_h = np.median(heights[shape_ok]) if np.any(shape_ok) else np.median(heights)
    D = (med_w + med_h) / 2.0
    
    size_ok = (widths >= 0.55 * med_w) & (widths <= 1.65 * med_w) & \
              (heights >= 0.55 * med_h) & (heights <= 1.65 * med_h)
              
    cand_boxes = boxes[shape_ok & size_ok]
    cand_confs = confs[shape_ok & size_ok]
    
    # NMS
    bboxes_cv = [[int(b[0]), int(b[1]), int(b[2]-b[0]), int(b[3]-b[1])] for b in cand_boxes]
    indices = cv2.dnn.NMSBoxes(bboxes_cv, [float(s) for s in cand_confs], 0.20, 0.30)
    if len(indices) > 0:
        clean_boxes = cand_boxes[indices.flatten()]
    else:
        clean_boxes = cand_boxes
        
    cx = (clean_boxes[:, 0] + clean_boxes[:, 2]) / 2.0
    cy = (clean_boxes[:, 1] + clean_boxes[:, 3]) / 2.0
    
    # Remove isolated points
    col_density = [np.sum(np.abs(cx - cx[i]) < 0.35 * D) for i in range(len(cx))]
    strip_points = np.array(col_density) >= 3
    if np.sum(strip_points) < 15:
        strip_points = np.array(col_density) >= 2
        
    valid_cx = cx[strip_points]
    valid_cy = cy[strip_points]
    
    # 3. Cluster 8 rows (A through H)
    row_init = np.linspace(np.min(valid_cy), np.max(valid_cy), 8)
    row_centers, _ = kmeans(valid_cy, row_init)
    row_centers = np.sort(row_centers)
    row_pitch = np.mean(np.diff(row_centers))
    
    # ANSI square lattice: col_pitch == row_pitch
    col_pitch = row_pitch
    x_min = np.min(valid_cx)
    col_centers = np.linspace(x_min, x_min + (num_cols - 1) * col_pitch, num_cols)
    
    # Match candidate detections to (r, c)
    pts_x, pts_y, r_idx, c_idx = [], [], [], []
    for x, y in zip(valid_cx, valid_cy):
        r = np.argmin(np.abs(row_centers - y))
        c = np.argmin(np.abs(col_centers - x))
        if np.abs(row_centers[r] - y) < 0.35 * row_pitch and np.abs(col_centers[c] - x) < 0.35 * col_pitch:
            r_idx.append(r)
            c_idx.append(c)
            pts_x.append(x)
            pts_y.append(y)
            
    # Fit Projective Homography (8 DOF) with RANSAC, falling back to Affine (6 DOF)
    well_coords = {}
    inner_r = int(0.40 * D)
    use_homography = False
    
    if len(pts_x) >= 16:
        src_grid = np.column_stack([c_idx, r_idx]).astype(np.float32)
        dst_pts = np.column_stack([pts_x, pts_y]).astype(np.float32)
        H, inliers = cv2.findHomography(src_grid, dst_pts, cv2.RANSAC, 0.25 * row_pitch)
        if H is not None and inliers is not None and np.sum(inliers) >= 12:
            det = np.linalg.det(H[:2, :2])
            if 1e-4 < abs(det) < 1e6:
                use_homography = True
                grid_all = np.array([[float(c), float(r)] for r in range(8) for c in range(num_cols)], dtype=np.float32)
                proj = cv2.perspectiveTransform(grid_all.reshape(-1, 1, 2), H).reshape(-1, 2)
                idx = 0
                for r in range(8):
                    r_letter = ROWS[r]
                    for c in range(num_cols):
                        cx_p = int(round(proj[idx, 0]))
                        cy_p = int(round(proj[idx, 1]))
                        well_coords[(r_letter, c + 1)] = (cx_p, cy_p, inner_r)
                        idx += 1
                        
    if not use_homography:
        # Robust Affine Least-Squares Fallback
        if len(pts_x) >= 12:
            A = np.column_stack([np.ones(len(pts_x)), np.array(c_idx), np.array(r_idx)])
            px, _, _, _ = np.linalg.lstsq(A, pts_x, rcond=None)
            py, _, _, _ = np.linalg.lstsq(A, pts_y, rcond=None)
        else:
            px = [x_min, col_pitch, 0]
            py = [row_centers[0], 0, row_pitch]
            
        for r in range(8):
            r_letter = ROWS[r]
            for c in range(num_cols):
                center_x = int(round(px[0] + px[1] * c + px[2] * r))
                center_y = int(round(py[0] + py[1] * c + py[2] * r))
                well_coords[(r_letter, c + 1)] = (center_x, center_y, inner_r)
                
    return well_coords

def extract_interwell_plastic_samples(bgr_img, well_coords, num_cols, patch_radius=3):
    """
    Samples the virgin white polystyrene microplate plastic at the geometric
    midpoints between adjacent wells (7 rows x (num_cols - 1) columns of intersection nodes).
    These provide invariant in-scene Lambertian white reference measurements.
    """
    h_img, w_img = bgr_img.shape[:2]
    plastic_samples = []
    
    for r_idx in range(7):
        r1, r2 = ROWS[r_idx], ROWS[r_idx + 1]
        for c_idx in range(1, num_cols):
            c1, c2 = c_idx, c_idx + 1
            w1 = well_coords.get((r1, c1))
            w2 = well_coords.get((r1, c2))
            w3 = well_coords.get((r2, c1))
            w4 = well_coords.get((r2, c2))
            
            if w1 and w2 and w3 and w4:
                mx = int(round((w1[0] + w2[0] + w3[0] + w4[0]) / 4.0))
                my = int(round((w1[1] + w2[1] + w3[1] + w4[1]) / 4.0))
                
                y1 = max(0, my - patch_radius)
                y2 = min(h_img, my + patch_radius + 1)
                x1 = max(0, mx - patch_radius)
                x2 = min(w_img, mx + patch_radius + 1)
                
                patch = bgr_img[y1:y2, x1:x2]
                if patch.size > 0:
                    plastic_samples.append({
                        "cx": mx,
                        "cy": my,
                        "b": float(np.median(patch[:, :, 0])),
                        "g": float(np.median(patch[:, :, 1])),
                        "r": float(np.median(patch[:, :, 2]))
                    })
                    
    return plastic_samples
