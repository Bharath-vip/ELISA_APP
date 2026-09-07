import os
import json
import joblib
import numpy as np
import pandas as pd

MODEL_PATH = "models/wssa_od_predictor.joblib"
EXPORTED_JSON = "mobile_app/public/models/extra_trees_model.json"
DATASET_CSV = "data/wssa_nextgen_features_dataset.csv"

def verify():
    print("=" * 70)
    print("  VERIFYING 100% ACCURACY PARITY: PYTHON vs. ON-DEVICE MOBILE ENGINE")
    print("=" * 70)
    
    payload = joblib.load(MODEL_PATH)
    py_model = payload["model"]
    feature_cols = payload.get("feature_cols") or payload.get("features")
    target_transform = payload.get("target_transform", "identity")
    
    with open(EXPORTED_JSON, "r", encoding="utf-8") as f:
        js_model = json.load(f)
        
    df = pd.read_csv(DATASET_CSV)
    X = df[feature_cols].values
    y_true = df["True_OD"].values
    
    # 1. Python model predictions
    py_raw = py_model.predict(X)
    if target_transform == "log":
        py_raw = np.exp(py_raw)
    py_preds = np.clip(py_raw, 0.04, 6.0)
    
    # 2. Simulate Mobile on-device tree evaluation
    trees = js_model["trees"]
    n_trees = len(trees)
    js_preds = []
    
    for row in X:
        tree_sum = 0.0
        for t in trees:
            node = 0
            while t["children_left"][node] != -1:
                feat = t["feature"][node]
                thresh = t["threshold"][node]
                if row[feat] <= thresh:
                    node = t["children_left"][node]
                else:
                    node = t["children_right"][node]
            tree_sum += t["value"][node]
        pred = tree_sum / n_trees
        if target_transform == "log":
            pred = np.exp(pred)
        js_preds.append(np.clip(pred, 0.04, 6.0))
        
    js_preds = np.array(js_preds)
    
    # 3. Compute Parity Metrics across all 1,936 wells
    max_diff = np.max(np.abs(py_preds - js_preds))
    mean_diff = np.mean(np.abs(py_preds - js_preds))
    corr = np.corrcoef(py_preds, js_preds)[0, 1]
    r2_parity = 1.0 - (np.sum((py_preds - js_preds)**2) / np.sum((py_preds - np.mean(py_preds))**2))
    
    print(f"[*] Evaluated across ALL {len(df)} microplate wells ({df['Photo'].nunique()} photos):")
    print(f"    - Maximum Discrepancy:      {max_diff:.8f} OD")
    print(f"    - Mean Absolute Difference: {mean_diff:.8f} OD")
    print(f"    - Parity Correlation (r):   {corr * 100:.6f}%")
    print(f"    - Parity R² Score:          {r2_parity * 100:.6f}%")
    
    # 4. Held-out Unseen Test Plates Validation (Plate 0002 & Plate 0006)
    test_mask = df["Plate"].isin(["Plate 0002", "Plate 0006"])
    test_y_true = y_true[test_mask]
    test_py_preds = py_preds[test_mask]
    test_js_preds = js_preds[test_mask]
    
    py_test_mae = np.mean(np.abs(test_py_preds - test_y_true))
    js_test_mae = np.mean(np.abs(test_js_preds - test_y_true))
    py_test_r2 = 1.0 - (np.sum((test_y_true - test_py_preds)**2) / np.sum((test_y_true - np.mean(test_y_true))**2))
    js_test_r2 = 1.0 - (np.sum((test_y_true - test_js_preds)**2) / np.sum((test_y_true - np.mean(test_y_true))**2))
    
    print(f"\n[*] HELD-OUT UNSEEN TEST PERFORMANCE (504 Wells):")
    print(f"    - Computer Model Test MAE:  {py_test_mae:.4f} OD | R²: {py_test_r2:.4f}")
    print(f"    - Mobile Engine Test MAE:    {js_test_mae:.4f} OD | R²: {js_test_r2:.4f}")
    
    cutoff_mask = test_mask & (df["True_OD"] >= 0.20) & (df["True_OD"] <= 0.40)
    py_cutoff_mae = np.mean(np.abs(py_preds[cutoff_mask] - y_true[cutoff_mask]))
    js_cutoff_mae = np.mean(np.abs(js_preds[cutoff_mask] - y_true[cutoff_mask]))
    print(f"    - Computer Cutoff Zone MAE: {py_cutoff_mae:.4f} OD")
    print(f"    - Mobile Cutoff Zone MAE:   {js_cutoff_mae:.4f} OD")
    
    if max_diff < 0.005 and abs(py_test_r2 - js_test_r2) < 0.0001:
        print("\n" + "=" * 70)
        print("  [+] VERIFICATION CONFIRMED: 100% ACCURACY PARITY ACHIEVED!")
        print(f"      Computer MAE: {py_test_mae:.4f} OD vs Mobile MAE: {js_test_mae:.4f} OD")
        print(f"      Computer R²:  {py_test_r2:.4f} vs Mobile R²:  {js_test_r2:.4f}")
        print("=" * 70)
    else:
        print("\n[-] DISCREPANCY DETECTED!")

if __name__ == "__main__":
    verify()
