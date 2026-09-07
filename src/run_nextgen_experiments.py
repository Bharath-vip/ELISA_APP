import os
import sys
import glob
import cv2
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

from sklearn.model_selection import GroupKFold
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error, accuracy_score, recall_score, precision_score, f1_score
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor, ExtraTreesRegressor
import xgboost as xgb
import lightgbm as lgb
import joblib

DATA_PATH = r"c:\Users\bhara\projects\ELISA\data\wssa_nextgen_features_dataset.csv"
ASSETS_DIR = r"c:\Users\bhara\projects\ELISA\assets"
MODELS_DIR = r"c:\Users\bhara\projects\ELISA\models"
os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

class OpticalDualRegimeMoE:
    """
    Optical Dual-Regime Gated Mixture-of-Experts:
    - Expert 1 (Cutoff Specialist): Optimized on low-to-moderate OD (<= 0.8) for diagnostic accuracy.
    - Expert 2 (High-Titer Specialist): Optimized on moderate-to-extreme OD (>= 0.4) for TMB amber saturation.
    - Soft Gating Network: Smooth transition based on chromatic amber index.
    """
    def __init__(self):
        self.expert_low = ExtraTreesRegressor(n_estimators=200, max_depth=14, random_state=42, n_jobs=-1)
        self.expert_high = ExtraTreesRegressor(n_estimators=200, max_depth=16, random_state=42, n_jobs=-1)
        self.transition_thresh = 1.05
        self.steepness = 12.0
        
    def fit(self, X, y, gate_features):
        mask_low = y <= 1.0
        mask_high = y >= 0.35
        
        y_log = np.log(y)
        self.expert_low.fit(X[mask_low], y_log[mask_low])
        self.expert_high.fit(X[mask_high], y_log[mask_high])
        return self
        
    def predict(self, X, gate_features):
        p_low = np.exp(self.expert_low.predict(X))
        p_high = np.exp(self.expert_high.predict(X))
        
        # Soft sigmoid gate based on amber/red shift (gate_features: RG_Ratio)
        gate_weight = 1.0 / (1.0 + np.exp(-self.steepness * (gate_features - self.transition_thresh)))
        preds = (1.0 - gate_weight) * p_low + gate_weight * p_high
        return preds

class BlendedUltraEnsemble:
    """
    Next-Gen Blended Ultra-Ensemble:
    Combines ExtraTrees, XGBoost, LightGBM, and Random Forest in Log-Target Space.
    """
    def __init__(self, weights=(0.35, 0.25, 0.20, 0.20)):
        self.weights = weights
        self.m_et = ExtraTreesRegressor(n_estimators=300, max_depth=18, random_state=42, n_jobs=-1)
        self.m_xgb = xgb.XGBRegressor(n_estimators=300, learning_rate=0.04, max_depth=6, random_state=42, n_jobs=-1)
        self.m_lgb = lgb.LGBMRegressor(n_estimators=300, learning_rate=0.04, num_leaves=31, random_state=42, verbose=-1)
        self.m_rf = RandomForestRegressor(n_estimators=300, max_depth=16, random_state=42, n_jobs=-1)
        
    def fit(self, X, y):
        y_log = np.log(y)
        self.m_et.fit(X, y_log)
        self.m_xgb.fit(X, y_log)
        self.m_lgb.fit(X, y_log)
        self.m_rf.fit(X, y_log)
        return self
        
    def predict(self, X):
        p_et = np.exp(self.m_et.predict(X))
        p_xgb = np.exp(self.m_xgb.predict(X))
        p_lgb = np.exp(self.m_lgb.predict(X))
        p_rf = np.exp(self.m_rf.predict(X))
        
        w = self.weights
        return w[0] * p_et + w[1] * p_xgb + w[2] * p_lgb + w[3] * p_rf

def run_benchmark():
    print("=" * 90)
    print("WSSA ELISA READER: NEXT-GENERATION BENCHMARK & EXPERIMENTAL SUITE")
    print("4-Fold GroupKFold Cross-Validation on 100% Unseen Microplates (1,936 Wells)")
    print("=" * 90)
    
    df = pd.read_csv(DATA_PATH)
    feature_cols = [c for c in df.columns if c not in ["Row", "Col", "Plate", "Photo", "True_OD"]]
    
    print(f"Total dataset records: {len(df)} wells across {len(df['Plate'].unique())} plates ({len(df['Photo'].unique())} photos)")
    print(f"Total optical physics features: {len(feature_cols)}")
    print(f"True OD dynamic range: [{df['True_OD'].min():.4f}, {df['True_OD'].max():.4f}] (mean={df['True_OD'].mean():.4f})")
    
    X = df[feature_cols].values
    y = df["True_OD"].values
    groups = df["Plate"].values
    rg_ratio_idx = feature_cols.index("RG_Ratio")
    
    gkf = GroupKFold(n_splits=4)
    
    # Model Registry
    models = {
        "1. Baseline Ridge Regressor": {
            "type": "ridge",
            "model": Ridge(alpha=1.0)
        },
        "2. Classical Random Forest": {
            "type": "standard",
            "model": RandomForestRegressor(n_estimators=300, max_depth=16, random_state=42, n_jobs=-1)
        },
        "3. Linearized LightGBM (Log)": {
            "type": "log_target",
            "model": lgb.LGBMRegressor(n_estimators=300, learning_rate=0.04, num_leaves=31, random_state=42, verbose=-1)
        },
        "4. Linearized XGBoost (Log)": {
            "type": "log_target",
            "model": xgb.XGBRegressor(n_estimators=300, learning_rate=0.04, max_depth=6, random_state=42, n_jobs=-1)
        },
        "5. ExtraTrees (Raw Target)": {
            "type": "standard",
            "model": ExtraTreesRegressor(n_estimators=300, max_depth=18, random_state=42, n_jobs=-1)
        },
        "6. Next-Gen ExtraTrees (Log)": {
            "type": "log_target",
            "model": ExtraTreesRegressor(n_estimators=300, max_depth=18, random_state=42, n_jobs=-1)
        },
        "7. Optical Dual-Regime MoE": {
            "type": "moe",
            "model": OpticalDualRegimeMoE()
        },
        "8. Blended Ultra-Ensemble (Log)": {
            "type": "blended",
            "model": BlendedUltraEnsemble(weights=(0.35, 0.25, 0.20, 0.20))
        }
    }
    
    results = []
    oof_predictions = {}
    
    for m_name, cfg in models.items():
        m_type = cfg["type"]
        oof_array = np.zeros(len(y), dtype=np.float32)
        fold_r2 = []
        fold_mae = []
        fold_cutoff_mae = []
        
        for fold, (train_idx, val_idx) in enumerate(gkf.split(X, y, groups)):
            X_train, y_train = X[train_idx], y[train_idx]
            X_val, y_val = X[val_idx], y[val_idx]
            
            if m_type == "ridge":
                from sklearn.preprocessing import StandardScaler
                scaler = StandardScaler()
                X_tr_sc = scaler.fit_transform(X_train)
                X_va_sc = scaler.transform(X_val)
                model = Ridge(alpha=10.0)
                model.fit(X_tr_sc, y_train)
                preds = np.clip(model.predict(X_va_sc), 0.04, 6.0)
                
            elif m_type == "standard":
                model = cfg["model"]
                model.fit(X_train, y_train)
                preds = np.clip(model.predict(X_val), 0.04, 6.0)
                
            elif m_type == "log_target":
                model = cfg["model"]
                y_tr_log = np.log(y_train)
                model.fit(X_train, y_tr_log)
                preds = np.clip(np.exp(model.predict(X_val)), 0.04, 6.0)
                
            elif m_type == "moe":
                model = OpticalDualRegimeMoE()
                gate_train = X_train[:, rg_ratio_idx]
                gate_val = X_val[:, rg_ratio_idx]
                model.fit(X_train, y_train, gate_train)
                preds = np.clip(model.predict(X_val, gate_val), 0.04, 6.0)
                
            elif m_type == "blended":
                model = BlendedUltraEnsemble()
                model.fit(X_train, y_train)
                preds = np.clip(model.predict(X_val), 0.04, 6.0)
                
            oof_array[val_idx] = preds
            r2 = r2_score(y_val, preds)
            mae = mean_absolute_error(y_val, preds)
            
            c_mask = (y_val >= 0.20) & (y_val <= 0.40)
            c_mae = mean_absolute_error(y_val[c_mask], preds[c_mask]) if np.any(c_mask) else 0.0
            
            fold_r2.append(r2)
            fold_mae.append(mae)
            fold_cutoff_mae.append(c_mae)
            
        oof_predictions[m_name] = oof_array
        
        overall_r2 = r2_score(y, oof_array)
        overall_mae = mean_absolute_error(y, oof_array)
        overall_rmse = np.sqrt(mean_squared_error(y, oof_array))
        
        cutoff_mask = (y >= 0.20) & (y <= 0.40)
        overall_cutoff_mae = mean_absolute_error(y[cutoff_mask], oof_array[cutoff_mask])
        
        # Clinical Outbreak Diagnostics under WOAH Standard (Cutoff = 0.30 OD)
        y_true_binary = y >= 0.30
        y_pred_binary = oof_array >= 0.30
        sens = recall_score(y_true_binary, y_pred_binary) * 100.0
        spec = recall_score(~y_true_binary, ~y_pred_binary) * 100.0
        prec = precision_score(y_true_binary, y_pred_binary) * 100.0
        f1 = f1_score(y_true_binary, y_pred_binary) * 100.0
        
        results.append({
            "Model": m_name,
            "R2": overall_r2,
            "R2_std": np.std(fold_r2),
            "MAE": overall_mae,
            "RMSE": overall_rmse,
            "Cutoff_MAE": overall_cutoff_mae,
            "Sensitivity": sens,
            "Specificity": spec,
            "Precision": prec,
            "F1_Score": f1
        })
        
        print(f"Completed {m_name:32s} | R²={overall_r2:.4f} (±{np.std(fold_r2):.4f}) | MAE={overall_mae:.4f} OD | Cutoff MAE={overall_cutoff_mae:.4f} OD | F1={f1:.2f}%")
        
    res_df = pd.DataFrame(results)
    print("\n" + "=" * 115)
    print("FINAL NEXT-GENERATION BENCHMARK RESULTS TABLE")
    print("=" * 115)
    header = f"{'Model':34s} {'Out-of-Sample R²':18s} {'Overall MAE':14s} {'RMSE':12s} {'Cutoff MAE':14s} {'Sensitivity':14s} {'Specificity':14s} {'F1-Score'}"
    print(header)
    print("-" * 115)
    for _, r in res_df.iterrows():
        print(f"{r['Model']:34s} {r['R2']:8.4f} (±{r['R2_std']:.3f})   {r['MAE']:8.4f} OD   {r['RMSE']:8.4f} OD   {r['Cutoff_MAE']:8.4f} OD   {r['Sensitivity']:8.1f}%       {r['Specificity']:8.1f}%       {r['F1_Score']:6.1f}%")
    print("=" * 115)
    
    # Identify Champion Model
    best_idx = res_df["R2"].idxmax()
    champ_name = res_df.loc[best_idx, "Model"]
    print(f"\n🏆 CHAMPION ARCHITECTURE: {champ_name} (R² = {res_df.loc[best_idx, 'R2']:.4f}, Cutoff MAE = {res_df.loc[best_idx, 'Cutoff_MAE']:.4f} OD)")
    
    # Train and Deploy Final Champion Model on Full Dataset
    print("\nTraining and deploying Final Champion Model on full 1,936 wells dataset...")
    if "Blended" in champ_name:
        final_model = BlendedUltraEnsemble()
        final_model.fit(X, y)
    elif "MoE" in champ_name:
        final_model = OpticalDualRegimeMoE()
        final_model.fit(X, y, X[:, rg_ratio_idx])
    elif "Log" in champ_name:
        final_model = ExtraTreesRegressor(n_estimators=350, max_depth=20, random_state=42, n_jobs=-1)
        final_model.fit(X, np.log(y))
    else:
        final_model = ExtraTreesRegressor(n_estimators=350, max_depth=20, random_state=42, n_jobs=-1)
        final_model.fit(X, y)
        
    model_payload = {
        "model": final_model,
        "feature_cols": feature_cols,
        "target_transform": "log" if ("Log" in champ_name or "Blended" in champ_name) else "identity",
        "benchmark_summary": res_df.to_dict(orient="records"),
        "champion_name": champ_name
    }
    
    save_path = os.path.join(MODELS_DIR, "wssa_od_predictor.joblib")
    joblib.dump(model_payload, save_path)
    print(f"✓ Deployed production model to: {save_path} ({os.path.getsize(save_path) / 1e6:.1f} MB)")
    
    # Feature Importance Extraction (from ExtraTrees component)
    et_model = ExtraTreesRegressor(n_estimators=300, max_depth=18, random_state=42, n_jobs=-1)
    et_model.fit(X, np.log(y))
    importances = et_model.feature_importances_
    feat_imp_df = pd.DataFrame({"Feature": feature_cols, "Importance": importances}).sort_values(by="Importance", ascending=False)
    
    print("\nTop 15 Most Influential Optical Features:")
    for idx, r in feat_imp_df.head(15).reset_index(drop=True).iterrows():
        print(f"  {idx+1:2d}. {r['Feature']:24s}: {r['Importance']*100:5.2f}%")
        
    # Generate 4-Panel Master Evaluation Figure
    print("\nGenerating publication-quality master benchmark visualization...")
    fig, axes = plt.subplots(2, 2, figsize=(16, 13))
    
    # 1. Parity Plot (Predicted vs True OD)
    ax1 = axes[0, 0]
    champ_oof = oof_predictions[champ_name]
    scatter = ax1.scatter(y, champ_oof, c=y, cmap="viridis", alpha=0.6, edgecolors="none", s=28)
    max_val = max(np.max(y), np.max(champ_oof)) * 1.05
    ax1.plot([0, max_val], [0, max_val], "r--", lw=2, label="1:1 Perfect Identity")
    ax1.axvline(0.30, color="orange", linestyle=":", lw=1.5, label="WOAH Cutoff (0.30 OD)")
    ax1.axhline(0.30, color="orange", linestyle=":", lw=1.5)
    ax1.set_title(f"{champ_name} (R² = {res_df.loc[best_idx, 'R2']:.4f})", fontsize=13, fontweight="bold")
    ax1.set_xlabel("True Spectrophotometer OD", fontsize=11)
    ax1.set_ylabel("Smartphone Predicted OD", fontsize=11)
    ax1.set_xlim(0, max_val)
    ax1.set_ylim(0, max_val)
    ax1.grid(True, linestyle="--", alpha=0.5)
    ax1.legend(loc="upper left")
    cbar = plt.colorbar(scatter, ax=ax1)
    cbar.set_label("Absorbance Level", fontsize=10)
    
    # 2. Cutoff Zone Zoom (0.0 to 0.7 OD)
    ax2 = axes[0, 1]
    cutoff_indices = y <= 0.70
    ax2.scatter(y[cutoff_indices], champ_oof[cutoff_indices], color="#1f77b4", alpha=0.7, edgecolors="k", linewidth=0.5, s=32)
    ax2.plot([0, 0.70], [0, 0.70], "r--", lw=2, label="1:1 Identity")
    ax2.axvspan(0.20, 0.40, color="gold", alpha=0.25, label="Decision Zone (0.20 - 0.40 OD)")
    ax2.axvline(0.30, color="red", linestyle=":", lw=1.5, label="WOAH Threshold (0.30)")
    ax2.set_title(f"Diagnostic Cutoff Zone Calibration (MAE = {res_df.loc[best_idx, 'Cutoff_MAE']:.4f} OD)", fontsize=13, fontweight="bold")
    ax2.set_xlabel("True Spectrophotometer OD", fontsize=11)
    ax2.set_ylabel("Smartphone Predicted OD", fontsize=11)
    ax2.set_xlim(0, 0.70)
    ax2.set_ylim(0, 0.70)
    ax2.grid(True, linestyle="--", alpha=0.5)
    ax2.legend(loc="upper left")
    
    # 3. Model Comparison Bar Chart (R² and Cutoff MAE)
    ax3 = axes[1, 0]
    m_labels = [r["Model"].split(". ")[-1] for r in results]
    r2_vals = [r["R2"] for r in results]
    c_maes = [r["Cutoff_MAE"] * 10.0 for r in results] # scale for visual comparison
    x_pos = np.arange(len(m_labels))
    width = 0.38
    
    ax3.bar(x_pos - width/2, r2_vals, width, label="Out-of-Sample R²", color="#2ca02c", edgecolor="black", alpha=0.85)
    ax3.bar(x_pos + width/2, c_maes, width, label="Cutoff MAE × 10 (OD)", color="#d62728", edgecolor="black", alpha=0.85)
    ax3.set_xticks(x_pos)
    ax3.set_xticklabels(m_labels, rotation=35, ha="right", fontsize=9)
    ax3.set_title("Architecture Comparison: Generalization & Precision", fontsize=13, fontweight="bold")
    ax3.set_ylabel("Metric Score", fontsize=11)
    ax3.set_ylim(0, 1.05)
    ax3.grid(axis="y", linestyle="--", alpha=0.5)
    ax3.legend(loc="lower left")
    
    # 4. Top 15 Feature Importances
    ax4 = axes[1, 1]
    top_feats = feat_imp_df.head(12).iloc[::-1]
    ax4.barh(top_feats["Feature"], top_feats["Importance"] * 100, color="#3b528b", edgecolor="black", alpha=0.85)
    ax4.set_title("Optical Physics Feature Contributions (%)", fontsize=13, fontweight="bold")
    ax4.set_xlabel("Relative Importance (%)", fontsize=11)
    ax4.grid(axis="x", linestyle="--", alpha=0.5)
    
    plt.tight_layout()
    plot_path = os.path.join(ASSETS_DIR, "nextgen_experiments_comparison.png")
    plt.savefig(plot_path, dpi=300, bbox_inches="tight")
    plt.close()
    print(f"✓ Saved master benchmark visualization to: {plot_path}")
    
    return res_df

if __name__ == "__main__":
    run_benchmark()
