import os
import glob
import cv2
import numpy as np
import pandas as pd
import streamlit as st
import joblib
from PIL import Image, ImageOps
import matplotlib.pyplot as plt

import sys

# Ensure src directory is in Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

# Import project modules
from parse_matrices import parse_single_excel, ROWS
from well_extractor import detect_plate_wells, extract_interwell_plastic_samples
from optical_enhancer import get_trimmed_well_pixels, fit_2d_illumination_surface, extract_advanced_optical_features
from diagnostic_engine import evaluate_plate_diagnostics, render_plate_heatmap, generate_pdf_report

DATA_DIR = r"C:\Users\bhara\projects\ELISA\ELISA Data Set"
MODEL_PATH = r"c:\Users\bhara\projects\ELISA\models\wssa_od_predictor.joblib"
ASSETS_DIR = r"c:\Users\bhara\projects\ELISA\assets"

st.set_page_config(
    page_title="WSSA Mobile ELISA Reader",
    page_icon="🦐",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling
st.markdown("""
<style>
    .main-title {
        font-size: 26px;
        font-weight: 800;
        color: #0F172A;
        margin-bottom: 2px;
    }
    .sub-title {
        font-size: 14px;
        color: #0284C7;
        font-weight: 600;
        margin-bottom: 15px;
    }
    .metric-box {
        background-color: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        padding: 12px;
        text-align: center;
    }
</style>
""", unsafe_allow_html=True)

DATASET_CSV_PATH = r"c:\Users\bhara\projects\ELISA\data\wssa_nextgen_features_dataset.csv"

@st.cache_resource
def load_trained_model(mtime):
    if os.path.exists(MODEL_PATH):
        return joblib.load(MODEL_PATH)
    return None

ROTATION_OVERRIDES = {
    "Plate A 0007.jpg": 90,
    "Plate C 0007.jpg": 180,
    "Plate C 0003.jpg": 90,
}

def load_oriented_plate(img_path):
    filename = os.path.basename(img_path)
    pil_img = Image.open(img_path)
    pil_img = ImageOps.exif_transpose(pil_img)
    rot = ROTATION_OVERRIDES.get(filename, None)
    if rot is not None:
        pil_img = pil_img.rotate(rot, expand=True)
    elif pil_img.size[1] > pil_img.size[0]:
        pil_img = pil_img.rotate(270, expand=True)
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

def process_plate_image(img, num_cols, model_payload, excel_gt_dict=None, override_model=None):
    coords = detect_plate_wells(img, num_cols)
    lab_img = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    hsv_img = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # 1. Sample inter-well virgin polystyrene plastic reference grid
    plastic_samples = extract_interwell_plastic_samples(img, coords, num_cols)
    
    # 2. Glare-trimmed well pixel extraction (10%-90% luminance trimmed)
    well_data = {}
    for (r_name, c_num), (cx, cy, inner_r) in coords.items():
        pix_info = get_trimmed_well_pixels(img, lab_img, hsv_img, cx, cy, inner_r, trim_percent=10)
        if pix_info is not None:
            well_data[(r_name, c_num)] = pix_info
            
    # 3. 2D Quadratic surface flat-fielding (plastic + blank reference)
    surfaces = fit_2d_illumination_surface(well_data, plastic_samples)
    
    # 4. Extract next-gen physical optical features
    feat_df = extract_advanced_optical_features(well_data, surfaces)
    
    # 5. Model inference with champion model or override model
    model = override_model if override_model is not None else model_payload["model"]
    feature_cols = model_payload.get("feature_cols") or model_payload.get("features")
    target_transform = model_payload.get("target_transform", "identity")
    
    if target_transform == "log":
        preds = np.clip(np.exp(model.predict(feat_df[feature_cols].values)), 0.04, 6.0)
    else:
        preds = np.clip(model.predict(feat_df[feature_cols].values), 0.04, 6.0)
    
    vis_img = img.copy()
    results = {}
    for idx, row in feat_df.iterrows():
        r_name = row["Row"]
        c_num = int(row["Col"])
        pred_val = float(preds[idx])
        true_val = excel_gt_dict.get((r_name, c_num), None) if excel_gt_dict else None
        results[(r_name, c_num)] = {
            "predicted_od": pred_val,
            "true_od": true_val
        }
        
        # Draw on vis image
        cx = well_data[(r_name, c_num)]["cx"]
        cy = well_data[(r_name, c_num)]["cy"]
        rad = coords[(r_name, c_num)][2]
        
        circle_col = (0, 0, 255) if pred_val >= 0.35 else (0, 255, 0)
        cv2.circle(vis_img, (cx, cy), rad, circle_col, 3)
        cv2.putText(vis_img, f"{pred_val:.2f}", (cx - 22, cy + 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
                    
    return results, vis_img

def main():
    st.markdown('<div class="main-title">🦐 AI-Powered Mobile ELISA Plate Reader</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-title">White Spot Syndrome Assay (WSSA) • Point-of-Care Shrimp Testing • Spec v2.0</div>', unsafe_allow_html=True)
    
    model_mtime = os.path.getmtime(MODEL_PATH) if os.path.exists(MODEL_PATH) else 0
    model_payload = load_trained_model(model_mtime)
    if not model_payload:
        st.error("Trained model not found! Please run `python src/train_6plates_split.py` first.")
        return
        
    # Sidebar
    st.sidebar.header("📱 App Controls")
    source_type = st.sidebar.radio("Image Input Mode:", ["Select from Dataset (8 Plates, 23 Photos)", "Upload New Photo"])
    
    selected_img_path = None
    excel_gt_dict = None
    num_cols = 10
    plate_name = "Custom Plate"
    
    if source_type == "Select from Dataset (8 Plates, 23 Photos)":
        subdirs = sorted([d for d in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, d))])
        test_plates = model_payload.get("test_plates", ["Plate 0002", "Plate 0006"])
        train_plates = model_payload.get("train_plates", [])
        
        # Put test plates first for easy evaluation
        sorted_plates = [p for p in subdirs if p in test_plates] + [p for p in subdirs if p not in test_plates]
        
        def format_plate_label(p):
            if p in test_plates:
                return f"🧪 {p} [HELD-OUT UNSEEN TEST]"
            else:
                return f"📚 {p} [TRAINING SET]"
                
        chosen_plate = st.sidebar.selectbox("Choose Physical Plate:", sorted_plates, format_func=format_plate_label)
        is_held_out_unseen = chosen_plate in test_plates
        
        plate_dir = os.path.join(DATA_DIR, chosen_plate)
        img_files = sorted(glob.glob(os.path.join(plate_dir, "*.jpg")) + glob.glob(os.path.join(plate_dir, "*.png")))
        xlsx_files = glob.glob(os.path.join(plate_dir, "*.xlsx"))
        
        chosen_img = st.sidebar.selectbox("Choose Photo Shot:", [os.path.basename(f) for f in img_files])
        selected_img_path = os.path.join(plate_dir, chosen_img)
        plate_name = f"{chosen_plate} ({chosen_img})"
        
        if xlsx_files:
            excel_gt_dict, num_cols = parse_single_excel(xlsx_files[0])
            st.sidebar.info(f"📊 Paired Ground-Truth: {num_cols} Active Columns ({len(excel_gt_dict)} wells)")
            
        if is_held_out_unseen:
            st.sidebar.success(f"🧪 **Test Plate Status**: 100% Unseen by Model (Never used in training)")
            active_override_model = None
        else:
            st.sidebar.info(f"📚 **Test Plate Status**: Part of 6 Training Plates")
            active_override_model = None
    else:
        uploaded_file = st.sidebar.file_uploader("Upload Plate Photo (.jpg / .png):", type=["jpg", "jpeg", "png"])
        uploaded_xlsx = st.sidebar.file_uploader("Optional: Upload Lab Spectrophotometer Excel (.xlsx):", type=["xlsx"])
        num_cols = st.sidebar.slider("Active Columns on Plate:", min_value=6, max_value=12, value=10)
        is_held_out_unseen = True
        active_override_model = None
        if uploaded_file is not None:
            temp_path = os.path.join(ASSETS_DIR, "temp_uploaded_plate.jpg")
            with open(temp_path, "wb") as f:
                f.write(uploaded_file.getbuffer())
            selected_img_path = temp_path
            plate_name = "Uploaded Field Sample"
            
        if uploaded_xlsx is not None:
            temp_xlsx = os.path.join(ASSETS_DIR, "temp_uploaded_excel.xlsx")
            with open(temp_xlsx, "wb") as f:
                f.write(uploaded_xlsx.getbuffer())
            excel_gt_dict, detected_cols = parse_single_excel(temp_xlsx)
            num_cols = detected_cols
            st.sidebar.info(f"📊 Paired Lab Excel: {num_cols} Active Columns ({len(excel_gt_dict)} wells)")
            
    client_name = st.sidebar.text_input("Pond / Facility Name:", value="AquaFarm Sector 3 - Pond B")
    
    if selected_img_path and os.path.exists(selected_img_path):
        img_bgr = load_oriented_plate(selected_img_path)
        
        with st.spinner("AI analyzing plate: detecting wells, normalizing color, predicting OD values..."):
            results, vis_img = process_plate_image(img_bgr, num_cols, model_payload, excel_gt_dict, override_model=active_override_model)
            diagnostics, summary = evaluate_plate_diagnostics(results, plate_name, client_name)
            
        # Top Metrics
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Wells Detected", f"{summary['total_wells']} Wells")
        col2.metric("Negative Control Cut-Off", f"{summary['cutoff_value']:.3f} OD")
        col3.metric("Positive (Infected) Wells", f"{summary['positive_wells']} Wells", delta=f"{summary['positive_wells']} alert", delta_color="inverse")
        col4.metric("Negative (Healthy) Wells", f"{summary['negative_wells']} Wells")
        
        # Main Tabs
        tab1, tab2, tab3, tab4 = st.tabs(["📸 Live Detection View", "📊 OD Matrix & Heatmap", "🚨 Outbreak Alert & Diagnostics", "📄 Download PDF Report"])
        
        with tab1:
            st.subheader("Plate Image with Automated Liquid-Core Detection")
            st.write("Green circles = Negative/Safe well (< Cut-Off) | Red circles = Positive/Infected well (> Cut-Off)")
            vis_rgb = cv2.cvtColor(vis_img, cv2.COLOR_BGR2RGB)
            st.image(vis_rgb, use_container_width=True)
            
        with tab2:
            st.subheader("Predicted Optical Density (OD) Matrix")
            # Build DataFrame matrix
            matrix_data = {}
            for c in range(1, num_cols + 1):
                matrix_data[f"Col {c}"] = [f"{results.get((r, c), {}).get('predicted_od', 0.0):.3f}" for r in ROWS]
            df_matrix = pd.DataFrame(matrix_data, index=ROWS)
            st.dataframe(df_matrix, use_container_width=True)
            
            # Heatmap
            heatmap_path = os.path.join(ASSETS_DIR, "live_app_heatmap.png")
            render_plate_heatmap(diagnostics, heatmap_path)
            st.image(heatmap_path, use_container_width=True)
            
        with tab3:
            st.subheader("Pond Biosecurity Diagnostic Evaluation (WOAH Protocol)")
            if summary["outbreak_alert"]:
                st.error(f"🚨 **OUTBREAK WARNING: White Spot Syndrome Virus (WSSV) Detected!**\n\n"
                         f"**{summary['positive_wells']} wells** exceeded the calculated safety cut-off of **{summary['cutoff_value']:.4f} OD**.\n"
                         f"Recommended Action: Immediate pond quarantine and bio-secure containment.")
            else:
                st.success(f"✅ **HEALTHY POND: No Pathogens Detected!**\n\n"
                           f"All {summary['total_wells']} wells are below the safety threshold of **{summary['cutoff_value']:.4f} OD**.")
                           
            # Parity Summary Cards if ground truth available
            if excel_gt_dict:
                pair_preds = []
                pair_trues = []
                cutoff_preds = []
                cutoff_trues = []
                for d in diagnostics.values():
                    if d['true_od'] is not None:
                        pair_preds.append(d['predicted_od'])
                        pair_trues.append(d['true_od'])
                        if 0.20 <= d['true_od'] <= 0.40:
                            cutoff_preds.append(d['predicted_od'])
                            cutoff_trues.append(d['true_od'])
                            
                if pair_trues:
                    pair_preds = np.array(pair_preds)
                    pair_trues = np.array(pair_trues)
                    plate_mae = np.mean(np.abs(pair_preds - pair_trues))
                    c_mae = np.mean(np.abs(np.array(cutoff_preds) - np.array(cutoff_trues))) if cutoff_trues else 0.0
                    from sklearn.metrics import r2_score
                    plate_r2 = max(r2_score(pair_trues, pair_preds), 0.0)
                    
                    st.markdown("#### 🔬 Spectrophotometer Parity & Error Analysis")
                    mcol1, mcol2, mcol3 = st.columns(3)
                    mcol1.metric("Plate MAE (Mean Absolute Error)", f"{plate_mae:.4f} OD")
                    mcol2.metric("Critical Cut-off Error (0.20–0.40 OD)", f"{c_mae:.4f} OD")
                    mcol3.metric("Spectrophotometer Parity (R²)", f"{plate_r2 * 100:.2f}%")
                    
                    if is_held_out_unseen:
                        st.info(
                            f"🧪 **HELD-OUT UNSEEN TEST PLATE ({chosen_plate}):**\n\n"
                            f"This plate was strictly excluded from training (model was trained on the 6 other physical plates). "
                            f"The variance column below displays genuine real-world generalization error on novel unseen microplates."
                        )
                    else:
                        st.warning(
                            f"📚 **TRAINING SET PLATE ({chosen_plate}):**\n\n"
                            f"This plate was one of the 6 plates used during model training (in-sample fit). "
                            f"To see true blind test generalization on unseen plates, choose **Plate 0002** or **Plate 0006** from the sidebar!"
                        )
            
            # Detailed table
            st.markdown("### Well-by-Well Reading & Parity")
            well_list = []
            for (r, c) in sorted(diagnostics.keys(), key=lambda x: (x[0], x[1])):
                d = diagnostics[(r, c)]
                variance_val = abs(d['predicted_od'] - d['true_od']) if d['true_od'] is not None else None
                variance_str = f"{variance_val:.4f}" if variance_val is not None else "N/A"
                well_list.append({
                    "Well": f"{r}{c}",
                    "Predicted OD": f"{d['predicted_od']:.3f}",
                    "True OD (Lab)": f"{d['true_od']:.3f}" if d['true_od'] is not None else "N/A",
                    "Variance (Abs Diff)": variance_str,
                    "Diagnosis": d['status']
                })
            st.dataframe(pd.DataFrame(well_list), use_container_width=True)
            
        with tab4:
            st.subheader("Generate Formal Diagnostic Certificate (PDF)")
            st.write("Generate a standardized test report for farm records, hatchery certification, or insurance.")
            
            pdf_path = os.path.join(ASSETS_DIR, "WSSA_Pond_Diagnostic_Report.pdf")
            if st.button("Generate & Prepare PDF Report"):
                generate_pdf_report(diagnostics, summary, pdf_path, heatmap_path)
                with open(pdf_path, "rb") as f:
                    pdf_bytes = f.read()
                st.download_button(
                    label="⬇️ Download Official PDF Diagnostic Certificate",
                    data=pdf_bytes,
                    file_name=f"WSSA_Report_{chosen_plate if 'chosen_plate' in locals() else 'FieldSample'}.pdf",
                    mime="application/pdf"
                )
                st.success("PDF Report successfully generated!")
    else:
        st.info("Please select or upload a plate image to start testing.")

if __name__ == "__main__":
    main()
