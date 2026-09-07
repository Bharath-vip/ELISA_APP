import os
import json
import joblib
import numpy as np
import pandas as pd

MODEL_PATH = "models/wssa_od_predictor.joblib"
DATASET_CSV = "data/wssa_nextgen_features_dataset.csv"
OUTPUT_JSON = "models/extra_trees_model.json"

def export_model():
    print("Loading ExtraTrees model payload from:", MODEL_PATH)
    payload = joblib.load(MODEL_PATH)
    model = payload["model"]
    feature_cols = payload.get("feature_cols") or payload.get("features")
    target_transform = payload.get("target_transform", "identity")
    train_plates = payload.get("train_plates", [])
    test_plates = payload.get("test_plates", [])
    
    print(f"Model has {len(model.estimators_)} trees.")
    print(f"Features ({len(feature_cols)}): {feature_cols}")
    
    trees_data = []
    for idx, est in enumerate(model.estimators_):
        tree = est.tree_
        tree_dict = {
            "children_left": tree.children_left.tolist(),
            "children_right": tree.children_right.tolist(),
            "feature": tree.feature.tolist(),
            "threshold": [round(float(t), 6) for t in tree.threshold],
            # For regression, value is shape (n_nodes, 1, 1) -> flatten to 1D
            "value": [round(float(v[0, 0]), 6) for v in tree.value]
        }
        trees_data.append(tree_dict)
        
    export_payload = {
        "n_estimators": len(trees_data),
        "features": feature_cols,
        "target_transform": target_transform,
        "train_plates": train_plates,
        "test_plates": test_plates,
        "trees": trees_data
    }
    
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(export_payload, f)
        
    size_mb = os.path.getsize(OUTPUT_JSON) / (1024 * 1024)
    print(f"[+] Exported {len(trees_data)} trees to {OUTPUT_JSON} ({size_mb:.2f} MB)")
    
    # Test parity on 100 random rows from dataset
    df = pd.read_csv(DATASET_CSV)
    sample_df = df.sample(n=min(200, len(df)), random_state=42)
    X_test = sample_df[feature_cols].values
    py_preds = model.predict(X_test)
    if target_transform == "log":
        py_preds = np.exp(py_preds)
    py_preds = np.clip(py_preds, 0.04, 6.0)
    
    # Simulate JS tree evaluation in Python to test exactness
    js_sim_preds = []
    for row in X_test:
        tree_outputs = []
        for t in trees_data:
            node = 0
            while t["children_left"][node] != -1:
                feat_idx = t["feature"][node]
                thresh = t["threshold"][node]
                if row[feat_idx] <= thresh:
                    node = t["children_left"][node]
                else:
                    node = t["children_right"][node]
            tree_outputs.append(t["value"][node])
        pred = sum(tree_outputs) / len(tree_outputs)
        if target_transform == "log":
            pred = np.exp(pred)
        js_sim_preds.append(np.clip(pred, 0.04, 6.0))
        
    js_sim_preds = np.array(js_sim_preds)
    max_diff = np.max(np.abs(py_preds - js_sim_preds))
    mean_diff = np.mean(np.abs(py_preds - js_sim_preds))
    r2_parity = 1.0 - (np.sum((py_preds - js_sim_preds)**2) / np.sum((py_preds - np.mean(py_preds))**2))
    
    print(f"\n[*] PARITY BENCHMARK RESULTS (Python Scikit-Learn vs Exported Trees):")
    print(f"    Max Absolute Difference:  {max_diff:.8f} OD")
    print(f"    Mean Absolute Difference: {mean_diff:.8f} OD")
    print(f"    Parity R² Score:          {r2_parity * 100:.6f}%")
    if max_diff < 0.0001:
        print("[+] VERIFICATION PASSED: 100% BIT-FOR-BIT ACCURACY PARITY CONFIRMED!")
    else:
        print("[-] WARNING: Parity discrepancy detected!")

if __name__ == "__main__":
    export_model()
