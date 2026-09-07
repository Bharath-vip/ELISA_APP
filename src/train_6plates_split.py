"""
Retrain AI Mobile ELISA Reader Model:
- 6 Physical Plates for Training (1,432 wells across 17 photos)
- 2 Physical Plates for 100% Held-out Testing/Validation (504 wells across 6 photos: Plate 0002 & Plate 0006)
"""

import os
import sys
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.ensemble import ExtraTreesRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score, confusion_matrix

DATASET_CSV = "data/wssa_nextgen_features_dataset.csv"
MODEL_PATH = "models/wssa_od_predictor.joblib"
ASSETS_DIR = "assets"
ARTIFACT_DIR = r"C:\Users\bhara\.gemini\antigravity\brain\e920d497-cf84-4c64-8cc4-4cba9573813e"

def main():
    print("=" * 70)
    print("  RETRAINING MODEL: 6 TRAINING PLATES vs. 2 UNSEEN TEST PLATES")
    print("=" * 70)
    
    df = pd.read_csv(DATASET_CSV)
    features = [c for c in df.columns if c not in ["Row", "Col", "Plate", "Photo", "True_OD"]]
    
    # Define Split
    test_plates = ["Plate 0002", "Plate 0006"]
    train_plates = [p for p in sorted(df["Plate"].unique()) if p not in test_plates]
    
    train_mask = df["Plate"].isin(train_plates)
    test_mask = df["Plate"].isin(test_plates)
    
    X_train = df.loc[train_mask, features].values
    y_train = df.loc[train_mask, "True_OD"].values
    
    X_test = df.loc[test_mask, features].values
    y_test = df.loc[test_mask, "True_OD"].values
    
    print(f"[*] Training Plates ({len(train_plates)}): {train_plates}")
    print(f"    Total Training Wells: {len(X_train)} across {df.loc[train_mask, 'Photo'].nunique()} photos")
    print(f"[*] Unseen Test Plates ({len(test_plates)}): {test_plates}")
    print(f"    Total Unseen Test Wells: {len(X_test)} across {df.loc[test_mask, 'Photo'].nunique()} photos")
    
    # Train ExtraTrees Champion Model
    print("\n[*] Training ExtraTreesRegressor (n_estimators=350, max_depth=18)...")
    model = ExtraTreesRegressor(n_estimators=350, max_depth=18, min_samples_split=3, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)
    print("[+] Model training complete!")
    
    # Predict on Unseen Test Set
    y_pred = np.clip(model.predict(X_test), 0.04, 6.0)
    
    # Overall Test Metrics
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    
    cutoff_mask = (y_test >= 0.20) & (y_test <= 0.40)
    c_mae = mean_absolute_error(y_test[cutoff_mask], y_pred[cutoff_mask])
    
    # Outbreak Diagnosis Classification Metrics (Cutoff = 0.35 OD)
    y_true_binary = (y_test >= 0.35).astype(int)
    y_pred_binary = (y_pred >= 0.35).astype(int)
    cm = confusion_matrix(y_true_binary, y_pred_binary)
    tn, fp, fn, tp = cm.ravel()
    sensitivity = tp / (tp + fn)
    specificity = tn / (tn + fp)
    accuracy = (tp + tn) / len(y_test)
    f1 = 2 * tp / (2 * tp + fp + fn)
    
    print("\n" + "=" * 70)
    print("      HELD-OUT TEST SET EVALUATION METRICS (100% UNSEEN PLATES)")
    print("=" * 70)
    print(f"Unseen Test Wells:           {len(y_test)} (Positive: {y_true_binary.sum()}, Negative: {(1-y_true_binary).sum()})")
    print(f"Overall Test MAE:            {mae:.4f} OD")
    print(f"Test RMSE:                   {rmse:.4f} OD")
    print(f"Spectrophotometer R² Score:  {r2:.4f} ({r2*100:.2f}% parity)")
    print(f"Critical Cutoff Zone MAE:    {c_mae:.4f} OD (0.20 - 0.40 OD)")
    print(f"Diagnostic Sensitivity:      {sensitivity*100:.2f}% (Found {tp} of {tp+fn} infected wells)")
    print(f"Diagnostic Specificity:      {specificity*100:.2f}% (Correct on {tn} of {tn+fp} healthy wells)")
    print(f"Diagnostic F1-Score:         {f1*100:.2f}%")
    print(f"Diagnostic Accuracy:         {accuracy*100:.2f}%")
    
    # Per-Plate Breakdown
    print("\n--- Individual Test Plate Breakdown ---")
    plate_breakdowns = {}
    for tp_name in test_plates:
        p_sub = df[df["Plate"] == tp_name].copy()
        p_sub["Pred_OD"] = model.predict(p_sub[features].values)
        p_mae = mean_absolute_error(p_sub["True_OD"], p_sub["Pred_OD"])
        p_r2 = r2_score(p_sub["True_OD"], p_sub["Pred_OD"])
        p_c_mask = (p_sub["True_OD"] >= 0.20) & (p_sub["True_OD"] <= 0.40)
        p_c_mae = mean_absolute_error(p_sub.loc[p_c_mask, "True_OD"], p_sub.loc[p_c_mask, "Pred_OD"])
        plate_breakdowns[tp_name] = {
            "wells": len(p_sub),
            "mae": p_mae,
            "cutoff_mae": p_c_mae,
            "r2": p_r2
        }
        print(f"[{tp_name}] Wells: {len(p_sub)} | MAE: {p_mae:.4f} OD | Cutoff MAE: {p_c_mae:.4f} OD | R²: {p_r2:.4f}")
    
    # Save Model Payload
    payload = {
        "model": model,
        "feature_cols": features,
        "target_transform": "identity",
        "train_plates": train_plates,
        "test_plates": test_plates,
        "metrics": {
            "mae": mae,
            "rmse": rmse,
            "r2": r2,
            "cutoff_mae": c_mae,
            "sensitivity": sensitivity,
            "specificity": specificity,
            "f1": f1,
            "accuracy": accuracy,
            "plate_breakdowns": plate_breakdowns
        }
    }
    joblib.dump(payload, MODEL_PATH, compress=3)
    print(f"\n[+] Retrained model successfully saved to: {MODEL_PATH} ({os.path.getsize(MODEL_PATH)/(1024*1024):.2f} MB)")
    
    # Generate 4-Panel Verification Plot
    print("[*] Generating 4-Panel Verification Benchmark Plot...")
    fig, axes = plt.subplots(2, 2, figsize=(14, 11), dpi=300)
    plt.subplots_adjust(hspace=0.28, wspace=0.22)
    
    # 1. Parity Scatter Plot
    ax1 = axes[0, 0]
    ax1.scatter(y_test, y_pred, alpha=0.55, c="#0284C7", edgecolors="none", s=35, label=f"Unseen Wells (N={len(y_test)})")
    lims = [0, max(max(y_test), max(y_pred)) + 0.3]
    ax1.plot(lims, lims, "r--", lw=2, label="1:1 Lab Parity Line")
    ax1.axvline(0.35, color="gray", linestyle=":", label="WOAH Cutoff (0.35 OD)")
    ax1.axhline(0.35, color="gray", linestyle=":")
    ax1.set_xlim(lims)
    ax1.set_ylim(lims)
    ax1.set_xlabel("True Spectrophotometer OD (Lab 450nm)", fontsize=11, fontweight="bold")
    ax1.set_ylabel("Predicted Smartphone AI OD", fontsize=11, fontweight="bold")
    ax1.set_title(f"Unseen Test Plates (Plates 2 & 6)\nOverall R² = {r2:.4f} | MAE = {mae:.4f} OD", fontsize=12, fontweight="bold")
    ax1.legend(loc="upper left", frameon=True)
    ax1.grid(True, alpha=0.3)
    
    # 2. Cutoff Decision Zone Zoom (0.0 to 0.7 OD)
    ax2 = axes[0, 1]
    zoom_mask = y_test <= 0.70
    ax2.scatter(y_test[zoom_mask], y_pred[zoom_mask], alpha=0.65, c="#10B981", edgecolors="k", lw=0.3, s=45)
    ax2.plot([0, 0.7], [0, 0.7], "r--", lw=2, label="1:1 Identity")
    ax2.axvline(0.35, color="red", linestyle=":", label="Clinical Cut-Off (0.35 OD)")
    ax2.axhline(0.35, color="red", linestyle=":")
    ax2.axvspan(0.20, 0.40, color="orange", alpha=0.15, label="Critical Decision Zone")
    ax2.set_xlim(0, 0.70)
    ax2.set_ylim(0, 0.70)
    ax2.set_xlabel("True Spectrophotometer OD (Lab)", fontsize=11, fontweight="bold")
    ax2.set_ylabel("Predicted Smartphone AI OD", fontsize=11, fontweight="bold")
    ax2.set_title(f"Cut-Off Decision Zone Zoom\nCut-off MAE = {c_mae:.4f} OD | F1 = {f1*100:.1f}%", fontsize=12, fontweight="bold")
    ax2.legend(loc="upper left", frameon=True, fontsize=9)
    ax2.grid(True, alpha=0.3)
    
    # 3. Residual Error Histogram
    ax3 = axes[1, 0]
    residuals = y_pred - y_test
    ax3.hist(residuals, bins=35, color="#6366F1", edgecolor="white", alpha=0.85)
    ax3.axvline(0, color="red", linestyle="--", lw=2, label="Zero Error Line")
    ax3.set_xlabel("Prediction Error (Predicted - True OD)", fontsize=11, fontweight="bold")
    ax3.set_ylabel("Number of Wells", fontsize=11, fontweight="bold")
    ax3.set_title(f"Unseen Test Error Distribution\nMean Error = {np.mean(residuals):.4f} OD (SD: {np.std(residuals):.4f})", fontsize=12, fontweight="bold")
    ax3.legend(loc="upper right", frameon=True)
    ax3.grid(True, alpha=0.3)
    
    # 4. Diagnostic Confusion Matrix
    ax4 = axes[1, 1]
    caxes = ax4.matshow(cm, cmap="Blues", alpha=0.75)
    fig.colorbar(caxes, ax=ax4, fraction=0.046, pad=0.04)
    for i in range(2):
        for j in range(2):
            val = cm[i, j]
            label = f"{val}\n({val/len(y_test)*100:.1f}%)"
            ax4.text(j, i, label, ha="center", va="center", fontsize=13, fontweight="bold",
                     color="white" if val > cm.max() / 2 else "black")
    ax4.set_xticks([0, 1])
    ax4.set_yticks([0, 1])
    ax4.set_xticklabels(["Negative (<0.35)", "Positive (≥0.35)"], fontsize=10, fontweight="bold")
    ax4.set_yticklabels(["Negative (<0.35)", "Positive (≥0.35)"], fontsize=10, fontweight="bold")
    ax4.set_xlabel("AI Model Diagnosis", fontsize=11, fontweight="bold")
    ax4.set_ylabel("Lab Ground-Truth", fontsize=11, fontweight="bold")
    ax4.set_title(f"Diagnostic Confusion Matrix (504 Wells)\nSens: {sensitivity*100:.1f}% | Spec: {specificity*100:.1f}% | Acc: {accuracy*100:.1f}%", fontsize=12, fontweight="bold", pad=15)
    
    fig_path = os.path.join(ASSETS_DIR, "train6_test2_benchmark.png")
    plt.savefig(fig_path, bbox_inches="tight", dpi=300)
    plt.close()
    print(f"[+] Saved benchmark figure to: {fig_path}")
    
    # Copy to artifact dir
    artifact_fig = os.path.join(ARTIFACT_DIR, "train6_test2_benchmark.png")
    import shutil
    shutil.copyfile(fig_path, artifact_fig)
    print(f"[+] Copied figure to artifact: {artifact_fig}")
    print("\n[+] Retraining and verification completed successfully!")

if __name__ == "__main__":
    main()
