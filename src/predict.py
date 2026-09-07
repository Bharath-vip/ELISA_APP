"""
AI Mobile ELISA Reader — Command-Line Prediction Tool
Run inference on any novel/unseen microplate photograph.

Usage Examples:
    # 1. Test on an unlabelled field sample:
    python src/predict.py --image "path/to/photo.jpg"

    # 2. Test on a novel plate with ground-truth validation:
    python src/predict.py --image "path/to/photo.jpg" --excel "path/to/ground_truth.xlsx"
"""

import os
import sys
import argparse
import cv2
import numpy as np
import pandas as pd
import joblib
from PIL import Image, ImageOps

# Add src to path
sys.path.insert(0, os.path.dirname(__file__))

from parse_matrices import parse_single_excel, ROWS
from well_extractor import detect_plate_wells, extract_interwell_plastic_samples
from optical_enhancer import get_trimmed_well_pixels, fit_2d_illumination_surface, extract_advanced_optical_features
from diagnostic_engine import evaluate_plate_diagnostics, render_plate_heatmap

DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "wssa_od_predictor.joblib")
DEFAULT_OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")

def load_oriented_plate(img_path):
    pil_img = Image.open(img_path)
    pil_img = ImageOps.exif_transpose(pil_img)
    if pil_img.size[1] > pil_img.size[0]:
        pil_img = pil_img.rotate(270, expand=True)
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

def run_prediction(image_path, excel_path=None, num_cols=10, model_path=DEFAULT_MODEL_PATH, out_dir=DEFAULT_OUT_DIR, unseen_plate=None):
    if not os.path.exists(image_path):
        print(f"[-] Error: Image file not found: {image_path}")
        return
        
    if not os.path.exists(model_path):
        print(f"[-] Error: Model payload not found: {model_path}")
        return
        
    os.makedirs(out_dir, exist_ok=True)
    
    payload = joblib.load(model_path)
    model = payload["model"]
    feature_cols = payload.get("feature_cols") or payload.get("features")
    target_transform = payload.get("target_transform", "identity")
    
    if unseen_plate:
        print(f"[*] Simulating UNSEEN test: Training model strictly excluding '{unseen_plate}'...")
        from sklearn.ensemble import ExtraTreesRegressor
        dataset_csv = os.path.join(os.path.dirname(__file__), "..", "data", "wssa_nextgen_features_dataset.csv")
        df_all = pd.read_csv(dataset_csv)
        features = [c for c in df_all.columns if c not in ["Row", "Col", "Plate", "Photo", "True_OD"]]
        train_df = df_all[df_all["Plate"] != unseen_plate]
        model = ExtraTreesRegressor(n_estimators=200, max_depth=16, random_state=42, n_jobs=-1)
        model.fit(train_df[features], train_df["True_OD"])
        feature_cols = features
        print(f"[+] Model trained without '{unseen_plate}' on {len(train_df)} physical wells.")
    else:
        print(f"[*] Loading master trained model from: {model_path}")
    
    # Check ground truth
    excel_gt = None
    if excel_path and os.path.exists(excel_path):
        excel_gt, detected_cols = parse_single_excel(excel_path)
        num_cols = detected_cols
        print(f"[+] Loaded paired Excel ground-truth: {num_cols} columns ({len(excel_gt)} wells)")
        
    print(f"[*] Reading and orienting plate image: {image_path}")
    img_bgr = load_oriented_plate(image_path)
    
    print(f"[*] Step 1: Detecting 96-well grid via YOLOv8 + RANSAC Homography...")
    coords = detect_plate_wells(img_bgr, num_cols)
    lab_img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    hsv_img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    
    print(f"[*] Step 2: Sampling virgin polystyrene plastic reference nodes...")
    plastic_samples = extract_interwell_plastic_samples(img_bgr, coords, num_cols)
    print(f"[+] Sampled {len(plastic_samples)} plastic calibration nodes.")
    
    print(f"[*] Step 3: Extracting glare-trimmed liquid cores & fitting flat-field surface...")
    well_data = {}
    for (r_name, c_num), (cx, cy, inner_r) in coords.items():
        pix_info = get_trimmed_well_pixels(img_bgr, lab_img, hsv_img, cx, cy, inner_r, trim_percent=10)
        if pix_info is not None:
            well_data[(r_name, c_num)] = pix_info
            
    surfaces = fit_2d_illumination_surface(well_data, plastic_samples)
    
    print(f"[*] Step 4: Extracting 33 next-generation optical physics features...")
    feat_df = extract_advanced_optical_features(well_data, surfaces)
    
    print(f"[*] Step 5: Predicting Optical Density (OD)...")
    if target_transform == "log":
        preds = np.clip(np.exp(model.predict(feat_df[feature_cols].values)), 0.04, 6.0)
    else:
        preds = np.clip(model.predict(feat_df[feature_cols].values), 0.04, 6.0)
        
    results = {}
    vis_img = img_bgr.copy()
    for idx, row in feat_df.iterrows():
        r_name = row["Row"]
        c_num = int(row["Col"])
        pred_val = float(preds[idx])
        true_val = excel_gt.get((r_name, c_num), None) if excel_gt else None
        results[(r_name, c_num)] = {
            "predicted_od": pred_val,
            "true_od": true_val
        }
        cx = well_data[(r_name, c_num)]["cx"]
        cy = well_data[(r_name, c_num)]["cy"]
        rad = coords[(r_name, c_num)][2]
        col = (0, 0, 255) if pred_val >= 0.35 else (0, 255, 0)
        cv2.circle(vis_img, (cx, cy), rad, col, 2)
        cv2.putText(vis_img, f"{pred_val:.2f}", (cx - 20, cy + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        
    # Diagnostics
    plate_base = os.path.splitext(os.path.basename(image_path))[0]
    diagnostics, summary = evaluate_plate_diagnostics(results, plate_base, "Field Test Sample")
    
    print("\n" + "=" * 60)
    print("           DIAGNOSTIC TEST RESULTS SUMMARY")
    print("=" * 60)
    print(f"Total Wells Analyzed:       {summary['total_wells']}")
    print(f"Negative Control Baseline:   {summary['mean_negative']:.4f} OD (SD: {summary['sd_negative']:.4f})")
    print(f"WOAH Safety Cut-Off:         {summary['cutoff_value']:.4f} OD")
    print(f"Positive (Infected) Wells:   {summary['positive_wells']}")
    print(f"Negative (Healthy) Wells:    {summary['negative_wells']}")
    print(f"Outbreak Alert Status:       {'[!] ALERT: PATHOGEN DETECTED' if summary['outbreak_alert'] else '[+] HEALTHY: NO OUTBREAK'}")
    
    if excel_gt:
        trues = [d['true_od'] for d in diagnostics.values() if d['true_od'] is not None]
        preds_list = [d['predicted_od'] for d in diagnostics.values() if d['true_od'] is not None]
        if trues:
            mae = np.mean(np.abs(np.array(preds_list) - np.array(trues)))
            cutoff_diffs = [abs(p - t) for p, t in zip(preds_list, trues) if 0.20 <= t <= 0.40]
            c_mae = np.mean(cutoff_diffs) if cutoff_diffs else 0.0
            print("-" * 60)
            print(f"Overall MAE vs Lab:          {mae:.4f} OD")
            print(f"Cut-off Zone MAE:            {c_mae:.4f} OD")
            
    print("=" * 60)
    
    # Save visualizations
    out_vis_path = os.path.join(out_dir, f"{plate_base}_predicted.jpg")
    cv2.imwrite(out_vis_path, vis_img)
    print(f"[+] Saved annotated detection view to: {out_vis_path}")
    
    out_heatmap_path = os.path.join(out_dir, f"{plate_base}_heatmap.png")
    render_plate_heatmap(diagnostics, out_heatmap_path)
    print(f"[+] Saved diagnostic heatmap to: {out_heatmap_path}")
    
    # Export CSV predictions
    csv_rows = []
    for (r, c) in sorted(diagnostics.keys(), key=lambda x: (x[0], x[1])):
        d = diagnostics[(r, c)]
        csv_rows.append({
            "Well": f"{r}{c}",
            "Row": r,
            "Col": c,
            "Predicted_OD": round(d["predicted_od"], 4),
            "True_OD": round(d["true_od"], 4) if d["true_od"] is not None else None,
            "Variance": round(abs(d["predicted_od"] - d["true_od"]), 4) if d["true_od"] is not None else None,
            "Status": d["status"]
        })
    df_out = pd.DataFrame(csv_rows)
    out_csv_path = os.path.join(out_dir, f"{plate_base}_readings.csv")
    df_out.to_csv(out_csv_path, index=False)
    print(f"[+] Saved detailed well readings CSV to: {out_csv_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Mobile ELISA Plate Reader Inference")
    parser.add_argument("--image", required=True, help="Path to input smartphone photo (.jpg, .png)")
    parser.add_argument("--excel", default=None, help="Optional path to lab spectrophotometer ground-truth (.xlsx)")
    parser.add_argument("--cols", type=int, default=10, help="Number of active columns on plate (default: 10)")
    parser.add_argument("--model", default=DEFAULT_MODEL_PATH, help="Path to trained model .joblib")
    parser.add_argument("--unseen", default=None, help="Plate name to exclude for unseen validation (e.g. 'Plate 0002')")
    parser.add_argument("--out", default=DEFAULT_OUT_DIR, help="Directory to save output files")
    args = parser.parse_args()
    
    run_prediction(args.image, args.excel, args.cols, args.model, args.out, args.unseen)
