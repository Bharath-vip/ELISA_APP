# ELISA Analyzer Architecture

## Overview
The ELISA Analyzer is a standalone, offline mobile application that captures or uploads microplate images, identifies sample wells, calculates optical density (OD), and classifies diagnostic results on-device.

---

## High-Level Flow

```
[ Camera / Upload ]
        |
        v
[ Plate Detection & Grid Alignment ]
        |
        v
[ Optical Feature Extraction ]
        |
        v
[ Machine Learning OD Inference ]
        |
        v
[ Diagnostic Cutoff Evaluation ]
        |
        v
[ Output: UI Grid, PDF Report, CSV Export ]
```

---

## System Layers

### 1. Presentation Layer (Mobile UI)
- **Framework**: React with TypeScript, packaged for Android using Capacitor.
- **Key Modules**:
  - Landscape Camera Viewfinder (rear camera access, continuous autofocus, alignment reticle).
  - Zoomable Detection Viewer (pinch-to-zoom, pan, dynamic overlay rendering).
  - Microplate Grid & Data Table (per-well OD matrix and status indication).
  - Cutoff Control (manual threshold stepper and direct numerical entry).

### 2. Detection and Alignment Layer
- **Well Detection**: YOLOv8 model running on-device via ONNX Runtime WebAssembly.
- **Grid Regularization**:
  - Automatically identifies row spacing and column count (10, 11, or 12 columns).
  - Employs 8-DOF Projective Homography with RANSAC to register physical well centers.
  - Excludes empty frame positions to prevent false positive detections.

### 3. Optical Processing Layer
- **Core Extraction**: Trims meniscus borders and glare highlights to isolate stable liquid cores.
- **Illumination Normalization**: Samples virgin polystyrene plastic nodes between wells to model spatial lighting variations.
- **Feature Extraction**: Generates color and absorbance features across RGB, HSV, and Lab color spaces.

### 4. Inference and Diagnostic Engine
- **OD Predictor**: Lightweight ExtraTrees decision forest running directly in JavaScript.
- **Diagnostic Logic**:
  - Compares predicted OD against the user-specified cutoff value.
  - Flags each well as Positive, Borderline, or Negative.
  - Computes plate-wide summary metrics (positive sample count, infection rate).

### 5. Export and Storage Layer
- **PDF Generation**: Generates clinical diagnostic reports locally using pdf-lib.
- **CSV Export**: Formats well matrices and test parameters for external review.
- **Native Share**: Dispatches files through the native Android system share dialog.
