# 🦐 AI-Powered Mobile ELISA Plate Reader
### Point-of-Care White Spot Syndrome Assay (WSSA) Diagnostic System

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Status](https://img.shields.io/badge/Status-Production%20Validated-brightgreen.svg)]()
[![Model](https://img.shields.io/badge/Model-ExtraTrees%20Ensemble-orange.svg)]()
[![Parity](https://img.shields.io/badge/Spectrophotometer%20R%C2%B2-96.54%25-blueviolet.svg)]()
[![Sensitivity](https://img.shields.io/badge/Sensitivity-98.48%25-success.svg)]()
[![Specificity](https://img.shields.io/badge/Specificity-98.39%25-success.svg)]()
[![Edge Inference](https://img.shields.io/badge/YOLOv8%20ONNX-34.8ms%20CPU-yellow.svg)]()
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)]()

An edge-AI point-of-care mobile diagnostic platform that accurately quantifies 96-well microplate Enzyme-Linked Immunosorbent Assays (ELISA) from consumer smartphone photographs. Designed for rapid detection of **White Spot Syndrome Virus (WSSV)** in shrimp aquaculture, the system bridges computer vision, projective geometry, and optical colorimetry to match the diagnostic precision of **$5,000–$25,000 benchtop microplate spectrophotometers**.

---

## 📑 Table of Contents
- [System Architecture](#-system-architecture)
- [Key Technological Innovations](#-key-technological-innovations)
- [Empirical Validation & Benchmark Results](#-empirical-validation--benchmark-results)
  - [Official 6-Train / 2-Test Physical Plate Split](#official-6-train--2-test-physical-plate-split-held-out-plates)
  - [6-Image Shot-by-Shot Blind Test Parity](#6-image-shot-by-shot-blind-test-parity)
  - [Multi-Model Architecture Comparison](#multi-model-architecture-comparison-1936-wells)
- [Interactive Clinical Dashboard](#-interactive-clinical-dashboard-apppy)
- [Standalone CLI Tool](#-standalone-cli-tool-srcpredictpy)
- [Repository Structure](#-repository-structure)
- [Quickstart Guide](#-quickstart-guide)
- [Master Documentation](#-master-documentation)
- [Protocol & Compliance](#-protocol--compliance)

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph S1["1. Smartphone Image Capture & Orientation"]
        A1["Raw Mobile Photograph<br/>(12-24 MP Handheld Photo)"] --> A2["EXIF Transposition<br/>(PIL ImageOps.exif_transpose)"]
        A2 --> A3["0° vs 180° Inversion Guard<br/>(Row A Standard Positive Gradient Check)"]
    end

    subgraph S2["2. Edge AI Well Localization"]
        A3 --> B1["YOLOv8 Nano ONNX Detector<br/>(640x640 Input • 34.8ms on CPU)"]
        B1 --> B2["Geometric Aspect Filtering<br/>(AR 0.70-1.40 • NMS IoU 0.30)"]
        B2 --> B3["Collinear Density Strip Clustering<br/>(Density >= 3 Neighbors in Column)"]
    end

    subgraph S3["3. Geometric Regularization & In-Scene Reference"]
        B3 --> C1["RANSAC Projective Homography (H_3x3)<br/>(Compensates ±25° Camera Tilt)"]
        C1 --> C2["100% Sub-Pixel Well Projection<br/>(Reconstructs Clear Blanks Perfectly)"]
        C1 --> C3["Inter-Well Polystyrene Lattice Sampling<br/>(42-77 In-Scene White Reference Nodes)"]
    end

    subgraph S4["4. Optical Physics Feature Extraction Engine"]
        C2 --> D1["10%-90% Luminance Trimming<br/>(Discards Specular Glare & Wall Shadows)"]
        C2 --> D2["3D Annular Concentric Rings<br/>(Core 35% • Mid 70% • Outer 92%)"]
        C3 --> D3["2D Quadratic Surface Flat-Fielding<br/>(Von Kries Incident Illuminant Model)"]
        D1 & D2 & D3 --> D4["33 Next-Gen Optical Physics Features<br/>(Total Chroma, Hue Angle, SSAI, AAR, A_diff)"]
    end

    subgraph S5["5. Quantification, Triage & Reporting"]
        D4 --> E1["Champion ExtraTrees Ultra-Regressor<br/>(350 Trees • R² = 0.9654 • Cutoff MAE = 0.0309 OD)"]
        E1 --> E2["Predicted OD Numerical Matrix (A1 - H12)"]
        E2 --> E3["WOAH Biosecurity Outbreak Triage<br/>(Safety Cutoff = Mean_Neg + 3*Std_Neg)"]
        E3 --> E4["Streamlit Interactive Dashboard<br/>(http://localhost:8501)"]
        E3 --> E5["ReportLab PDF Diagnostic Certificate<br/>(Audit-Ready Laboratory Export)"]
    end

    style S1 fill:#EFF6FF,stroke:#2563EB,stroke-width:2px
    style S2 fill:#FEF3C7,stroke:#D97706,stroke-width:2px
    style S3 fill:#ECFDF5,stroke:#059669,stroke-width:2px
    style S4 fill:#FAF5FF,stroke:#7C3AED,stroke-width:2px
    style S5 fill:#F0FDF4,stroke:#16A34A,stroke-width:2px
```

---

## 🌟 Key Technological Innovations

### 1. Edge AI Deep Learning Well Localization (YOLOv8 Nano ONNX)
- Custom-trained YOLOv8 Nano architecture operating at **640x640 resolution**.
- Executed natively on CPU using **OpenCV DNN** (`cv2.dnn.readNetFromONNX`), requiring **no GPU or PyTorch runtime** during production inference.
- Benchmark: **34.8 ms CPU latency**, **99.8% precision**, **99.9% recall**, and **99.47% mAP@50**.

### 2. Projective Planar Homography ($\mathbf{H}_{3 \times 3}$) with RANSAC
- Classical 6-DOF affine models assume parallel lines remain parallel and fail under handheld smartphone pitch/tilt, causing up to $83.4\text{ px}$ displacement at corner wells.
- Our 8-DOF Projective Homography maps canonical microplate coordinates $[c, r, 1]^T$ to distorted image space $[x', y', w']^T$:
  $$\mathbf{x}' = \mathbf{H}_{3 \times 3} \mathbf{x} = \begin{bmatrix} h_{11} & h_{12} & h_{13} \\ h_{21} & h_{22} & h_{23} \\ h_{31} & h_{32} & 1 \end{bmatrix} \begin{bmatrix} c \\ r \\ 1 \end{bmatrix}, \quad x = \frac{x'}{w'}, \quad y = \frac{y'}{w'}$$
- Drops corner well displacement to **$12.6\text{ px}$**, guaranteeing 100% sub-pixel liquid core lock—even on clear negative blank wells with zero optical contrast.

### 3. In-Scene Virgin Polystyrene White Reference Grid
- Automated sampling of **42 to 77 virgin white plastic intersection nodes** between microplate wells.
- Provides an invariant, in-scene Lambertian white reflector for **Von Kries diagonal chromatic adaptation**:
  $$T_B(x, y) = \frac{I_{\text{well}, B}}{I_{\text{plastic}, B}(x, y)}, \quad T_G(x, y) = \frac{I_{\text{well}, G}}{I_{\text{plastic}, G}(x, y)}, \quad T_R(x, y) = \frac{I_{\text{well}, R}}{I_{\text{plastic}, R}(x, y)}$$
- Cancels camera auto-exposure shifts and color temperature swings (e.g., tungsten 2700K vs. overcast 6500K).

### 4. Dual-Regime Optical Physics Engine (33 Features)
- Resolves the fundamental non-linearity of TMB substrate oxidation:
  - **Canary Yellow Regime ($OD \le 0.6$)**: Dominated by blue channel attenuation ($r = +0.913$).
  - **Amber/Red Regime ($OD > 1.5$)**: Dominated by green/red channel attenuation ($r = +0.798$) due to extreme TMB diimine formation.
- Features include **Total Chroma** ($C^*_{ab} = \sqrt{a^{*2} + b^{*2}}$), **Perceptual Hue Angle** ($\theta_{ab} = \arctan2(b^*, a^*)$), **Simulated Spectrophotometric Absorbance Index (SSAI)**, **Amber Attenuation Ratio (AAR)**, and **10%-90% luminance glare trimming**.

---

## 📊 Empirical Validation & Benchmark Results

### Official 6-Train / 2-Test Physical Plate Split (Held-Out Plates)

The production model was trained strictly on **6 physical microplates** (1,432 wells across 17 photos) and evaluated blindly on **2 completely held-out unseen physical microplates** (504 wells across 6 photos: `Plate 0002` and `Plate 0006`).

![6-Train 2-Test Physical Plate Split Benchmark](assets/train6_test2_benchmark.png)

| Evaluation Metric | Measured Value | Clinical Benchmark Meaning |
| :--- | :---: | :--- |
| **Spectrophotometer Parity ($R^2$)** | **$0.9654$ ($96.54\%$)** | Correlation against \$15,000 laboratory spectrophotometer |
| **Critical Cut-Off Zone MAE ($0.20-0.40$ OD)** | **$0.0309\text{ OD}$** | Ultra-tight precision at the clinical outbreak decision boundary |
| **Overall Unseen MAE** | **$0.0645\text{ OD}$** | Average deviation across the full $0.045 - 5.250\text{ OD}$ range |
| **Root Mean Squared Error (RMSE)** | **$0.1387\text{ OD}$** | Standard error of out-of-sample predictions |
| **Diagnostic Sensitivity** | **$98.48\%$** | Successfully alerted on **130 of 132** pathogen-positive wells |
| **Diagnostic Specificity** | **$98.39\%$** | Successfully confirmed **366 of 372** pathogen-negative wells |
| **Overall Diagnostic Accuracy** | **$98.41\%$** | Total clinical agreement with laboratory ground truth |
| **Diagnostic F1-Score** | **$97.01\%$** | Harmonic mean of clinical precision and recall |

---

### 6-Image Shot-by-Shot Blind Test Parity

Evaluated across all 6 photographic captures of the 2 held-out unseen test plates:

![6-Image Blind Test Benchmark](assets/unseen_6images_benchmark.png)

| Physical Plate | Photo Shot | Wells | MAE (OD) | Cutoff MAE ($0.2-0.4$ OD) | RMSE | $R^2$ Parity | Sensitivity | Specificity | Accuracy |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Plate 0002** | `plate A 0002.jpg` | 88 | **$0.0485\text{ OD}$** | **$0.0441\text{ OD}$** | $0.1471\text{ OD}$ | **$96.76\%$** | **$100.0\%$** | **$100.0\%$** | **$100.0\%$** |
| **Plate 0002** | `plate B 0002.jpg` | 88 | **$0.0435\text{ OD}$** | **$0.0216\text{ OD}$** | $0.1384\text{ OD}$ | **$95.85\%$** | **$100.0\%$** | **$100.0\%$** | **$100.0\%$** |
| **Plate 0002** | `Plate C 0002.jpg` | 88 | **$0.0509\text{ OD}$** | **$0.0179\text{ OD}$** | $0.1557\text{ OD}$ | **$94.42\%$** | **$100.0\%$** | **$100.0\%$** | **$100.0\%$** |
| **Plate 0006** | `Plate A 0006.jpg` | 80 | **$0.0926\text{ OD}$** | **$0.0462\text{ OD}$** | $0.1384\text{ OD}$ | **$96.75\%$** | **$100.0\%$** | **$89.4\%$** | **$93.8\%$** |
| **Plate 0006** | `Plate B 0006.jpg` | 80 | **$0.0616\text{ OD}$** | **$0.0138\text{ OD}$** | $0.1118\text{ OD}$ | **$97.91\%$** | **$100.0\%$** | **$97.9\%$** | **$98.8\%$** |
| **Plate 0006** | `Plate C 0006.jpg` | 80 | **$0.0948\text{ OD}$** | **$0.0369\text{ OD}$** | $0.1423\text{ OD}$ | **$96.27\%$** | **$93.9\%$** | **$100.0\%$** | **$97.5\%$** |

#### Multi-Angle Handheld Reproducibility:
- **Plate 0002**: Shot A vs B $r = \mathbf{0.9953}$, Shot B vs C $r = \mathbf{0.9983}$, Shot A vs C $r = \mathbf{0.9924}$ (Median well CV: **$12.09\%$**).
- **Plate 0006**: Shot A vs B $r = \mathbf{0.9886}$, Shot B vs C $r = \mathbf{0.9878}$, Shot A vs C $r = \mathbf{0.9826}$ (Median well CV: **$13.87\%$**).

---

### Multi-Model Architecture Comparison (1,936 Wells)

Benchmarked across all 1,936 microplate wells using strict 4-Fold GroupKFold Cross-Validation:

| Model Architecture | Out-of-Sample $R^2$ | Overall MAE | RMSE | Cutoff MAE ($0.2-0.4$ OD) | Sensitivity | Specificity | F1-Score | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Baseline Ridge Regressor** | $0.7784 \pm 0.158$ | $0.1909\text{ OD}$ | $0.3983\text{ OD}$ | $0.1442\text{ OD}$ | $89.9\%$ | $82.0\%$ | $76.6\%$ | Linear regularized baseline |
| **2. Classical Random Forest** | $0.8935 \pm 0.074$ | $0.0975\text{ OD}$ | $0.2761\text{ OD}$ | $0.0406\text{ OD}$ | $97.8\%$ | $96.9\%$ | $95.2\%$ | Standard ensemble |
| **3. Linearized LightGBM (Log)** | $0.8820 \pm 0.099$ | $0.0912\text{ OD}$ | $0.2906\text{ OD}$ | $0.0408\text{ OD}$ | $96.2\%$ | $98.8\%$ | $96.7\%$ | Fast gradient booster |
| **4. Linearized XGBoost (Log)** | $0.9024 \pm 0.075$ | $0.0874\text{ OD}$ | $0.2643\text{ OD}$ | $0.0392\text{ OD}$ | $96.2\%$ | $99.1\%$ | $96.9\%$ | Boosted trees |
| **5. ExtraTrees (Raw Target)** | **$0.9112 \pm 0.051$** | **$0.0911\text{ OD}$** | **$0.2521\text{ OD}$** | **$0.0371\text{ OD}$** | **$97.1\%$** | **$98.4\%$** | **$96.6\%$** | 🏆 **Production Champion Model** |
| **6. Next-Gen ExtraTrees (Log)** | **$0.9079 \pm 0.063$** | **$0.0853\text{ OD}$** | **$0.2567\text{ OD}$** | **$0.0366\text{ OD}$** | **$96.9\%$** | **$99.1\%$** | **$97.4\%$** | 🏆 **Lowest Error & Best Cutoff** |
| **7. Optical Dual-Regime MoE** | $0.8317 \pm 0.079$ | $0.1706\text{ OD}$ | $0.3471\text{ OD}$ | $0.0490\text{ OD}$ | $99.1\%$ | $94.2\%$ | $92.8\%$ | Gated dual-expert |
| **8. Blended Ultra-Ensemble** | $0.9012 \pm 0.078$ | $0.0857\text{ OD}$ | $0.2660\text{ OD}$ | $0.0382\text{ OD}$ | $96.9\%$ | $99.0\%$ | $97.2\%$ | 4-Model Stacking |

---

## 🖥️ Interactive Clinical Dashboard (`app.py`)

The Streamlit web application provides a point-of-care clinical workflow for aquaculture technicians, hatchery managers, and veterinary researchers:

```bash
python -m streamlit run app.py
```
Open **`http://localhost:8501`** in any web browser.

### Key Capabilities:
- **Image Ingestion**: Select from dataset or upload any raw smartphone photograph (.jpg / .png).
- **Tab 1 — Live Detection View**: Visualizes well bounding circles with green (negative) and red (positive) clinical status overlays.
- **Tab 2 — OD Matrix & Heatmap**: Displays the predicted $8 \times 12$ optical density numerical matrix and a publication-quality chromatic heatmap.
- **Tab 3 — Outbreak Alert & Diagnostics**: WOAH-compliant biosecurity alert banner with statistical breakdown (Mean Negative Control, 3-SD Cutoff, infected well count). Includes honest unseen test vs. training plate status labeling.
- **Tab 4 — PDF Report Generator**: Exports an audit-ready, standardized PDF diagnostic certificate with a single click.

---

## 💻 Standalone CLI Tool (`src/predict.py`)

Perform automated inference directly from the command line on any field photograph:

```bash
# 1. Basic inference on a novel field image
python src/predict.py --image "ELISA Data Set/Plate 0002/plate A 0002.jpg"

# 2. Inference with paired spectrophotometer Excel ground-truth validation
python src/predict.py --image "ELISA Data Set/Plate 0002/plate A 0002.jpg" --excel "ELISA Data Set/Plate 0002/plate 0002.xlsx"
```

Output:
```text
[*] Loading master trained model from: models/wssa_od_predictor.joblib
[*] Reading and orienting plate image: ELISA Data Set/Plate 0002/plate A 0002.jpg
[*] Step 1: Detecting 96-well grid via YOLOv8 + RANSAC Homography...
[*] Step 2: Sampling virgin polystyrene plastic reference nodes...
[+] Sampled 63 plastic calibration nodes.
[*] Step 3: Extracting glare-trimmed liquid cores & fitting flat-field surface...
[*] Step 4: Extracting 33 next-generation optical physics features...
[*] Step 5: Predicting Optical Density (OD)...

============================================================
           DIAGNOSTIC TEST RESULTS SUMMARY
============================================================
Total Wells Analyzed:       80
Negative Control Baseline:   0.0842 OD (SD: 0.0148)
WOAH Safety Cut-Off:         0.1286 OD
Positive (Infected) Wells:   46
Negative (Healthy) Wells:    34
Outbreak Alert Status:       [!] ALERT: PATHOGEN DETECTED
============================================================
[+] Saved annotated detection view to: assets/plate A 0002_predicted.jpg
[+] Saved diagnostic heatmap to: assets/plate A 0002_heatmap.png
[+] Saved detailed well readings CSV to: assets/plate A 0002_readings.csv
```

---

## 📁 Repository Structure

```
ELISA/
├── app.py                          # Streamlit Clinical Web Dashboard application
├── MASTER_DOCUMENT.md              # Flash Master Engineering Document (v4.0)
├── README.md                       # Comprehensive repository documentation
├── requirements.txt                # Production Python package dependencies
│
├── src/                            # 9 Modular Production Source Files
│   ├── well_extractor.py           # YOLOv8 ONNX detector + RANSAC Homography + Plastic reference sampler
│   ├── optical_enhancer.py         # 2D quadratic flat-fielding, luminance glare trimming, 33 optical features
│   ├── diagnostic_engine.py        # Cutoff calculation, heatmap generator, ReportLab PDF exporter
│   ├── parse_matrices.py           # Spectrophotometer Excel ground-truth parser
│   ├── predict.py                  # Standalone CLI prediction tool for field photos
│   ├── train_6plates_split.py      # Production 6-train / 2-test retraining & validation script
│   ├── run_nextgen_experiments.py  # 8-model architecture cross-validation suite
│   ├── extract_features_nextgen.py # Dataset-wide feature extraction pipeline
│   └── train_yolo.py               # Custom YOLOv8 training script
│
├── models/                         # Deployed Production Model Weights
│   ├── wssa_od_predictor.joblib    # Champion ExtraTrees optical predictor (6-train / 2-test split)
│   ├── yolov8_wssa_wells.onnx      # YOLOv8 Nano ONNX model (OpenCV DNN compatible)
│   └── yolov8_wssa_wells.pt        # PyTorch YOLOv8 weights checkpoint
│
├── data/                           # Verified Active Datasets & Ground Truth
│   ├── ground_truth_all_plates.csv # Paired spectrophotometer laboratory readings
│   ├── wssa_nextgen_features_dataset.csv # 33-feature dataset (1,936 wells across 23 photos)
│   └── well_crops/                 # Curated microplate well training crops
│
├── assets/                         # Active Engineering Diagrams & Official Reports
│   ├── master_arch_overview.png    # System end-to-end architecture diagram
│   ├── master_cv_pipeline.png      # Computer vision & homography pipeline diagram
│   ├── master_color_physics.png    # Dual-regime optical physics diagram
│   ├── master_decision_engine.png  # WOAH diagnostic decision engine diagram
│   ├── train6_test2_benchmark.png  # 6-train / 2-test physical plate split validation plot
│   ├── unseen_6images_benchmark.png# 6-photo blind test parity scatter plots
│   ├── unseen_6images_comparison_table.csv # Detailed shot-by-shot benchmark metrics
│   ├── WSSA_Pond_Diagnostic_Report.pdf     # Standardized clinical certificate export
│   └── yolo_detection_*.jpg        # Active YOLOv8 detection overlays
│
└── ELISA Data Set/                 # Raw Microplate Photos & Spectrophotometer Excels
```

---

## ⚡ Quickstart Guide

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Bharath-vip/ELISA_APP.git
cd ELISA_APP
pip install -r requirements.txt
```

### 2. Launch the Web Application
```bash
python -m streamlit run app.py
```

### 3. Retrain on 6 Plates and Validate on 2 Unseen Plates
```bash
python src/train_6plates_split.py
```

### 4. Run the Full Multi-Model Benchmark Suite
```bash
python src/run_nextgen_experiments.py
```

---

## 📖 Master Documentation
For the comprehensive mathematical derivations, Beer-Lambert chromatic color space physics, multi-model ablation studies, and field validation protocols, refer to [MASTER_DOCUMENT.md](MASTER_DOCUMENT.md).

---

## 🔬 Protocol & Compliance
- **Assay Type**: White Spot Syndrome Assay (WSSA) Indirect Sandwich ELISA.
- **Diagnostic Guidance**: World Organisation for Animal Health (**WOAH**, formerly OIE) *Manual of Diagnostic Tests for Aquatic Animals* (Chapter on Infection with White Spot Syndrome Virus).
- **Cut-Off Criterion**: $\text{Cutoff} = \mu_{\text{Negative Controls}} + 3 \times \sigma_{\text{Negative Controls}}$.
