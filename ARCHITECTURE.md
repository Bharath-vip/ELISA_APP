# Mobile ELISA Plate Reader — System Architecture

A lightweight, 100% offline edge-AI diagnostic system that converts smartphone photos into laboratory-grade spectrophotometer optical density (OD) readings for rapid aquaculture pathogen screening.

---

## 1. End-to-End Pipeline

```mermaid
flowchart TD
    classDef input fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef cv fill:#0f172a,stroke:#34d399,stroke-width:2px,color:#f8fafc;
    classDef optical fill:#0f172a,stroke:#fbbf24,stroke-width:2px,color:#f8fafc;
    classDef ml fill:#0f172a,stroke:#a78bfa,stroke-width:2px,color:#f8fafc;
    classDef output fill:#1e293b,stroke:#f87171,stroke-width:2px,color:#f8fafc;

    A["📸 Image Capture / Upload<br/>(Landscape 12×8 Reticle)"]:::input
    
    subgraph CV["Phase 1: Computer Vision & Geometry"]
        B["Orientation Guard<br/>(Auto 90° Normalizer)"]:::cv
        C["YOLOv8 Nano (ONNX/WASM)<br/>Well Bounding Box Detection"]:::cv
        D["8-DOF RANSAC Homography<br/>Lattice Fitting & Column Trimming"]:::cv
    end

    subgraph Optical["Phase 2: Optical Physics Correction"]
        E["Polystyrene Inter-Well Sampling<br/>(In-Scene White Balance)"]:::optical
        F["Concentric Glare Trimming<br/>(Liquid Core Isolation)"]:::optical
        G["2D Quadratic Flat-Fielding<br/>(Illumination Normalization)"]:::optical
    end

    subgraph ML["Phase 3: Machine Learning Inference"]
        H["33 Optical Spectral Features<br/>(Chroma, Hue, SSAI, NDYI)"]:::ml
        I["ExtraTrees Regressor<br/>(350 Trees · 1ms on Device)"]:::ml
    end

    subgraph Out["Phase 4: Diagnostics & Export"]
        J["Predicted OD Matrix (8×12)"]:::output
        K["Manual Cutoff & Dynamic Overlay"]:::output
        L["PDF Certificate & CSV Export"]:::output
    end

    A --> B --> C --> D
    D --> E --> F --> G
    G --> H --> I
    I --> J --> K --> L
```

---

## 2. Core Architectural Pillars

| Stage | Technology | Function |
| :--- | :--- | :--- |
| **1. Vision & Geometry** | YOLOv8 Nano + RANSAC Homography | Detects circular wells, rectifies camera perspective tilt, and auto-detects column span (10, 11, or 12 columns) without false frame detections. |
| **2. Optical Physics** | Quadratic Flat-Fielding + Polystyrene Sampling | Samples in-scene plastic nodes to remove uneven shadows, vignette, and meniscus glare across the plate. |
| **3. Machine Learning** | ExtraTrees Ensemble (Compiled JSON) | Evaluates 33 chromatic and spectral features per well to predict spectrophotometer OD ($0.00 - 5.50\text{ OD}$) in $< 1\text{ ms}$. |
| **4. Diagnostic Engine** | Real-Time Canvas Re-Renderer | Dynamically updates Positive (Red), Borderline (Amber), and Negative (Green) statuses as the user adjusts the diagnostic cutoff. |

---

## 3. Technology Stack

- **Application Core**: React 19, TypeScript, Vite, TailwindCSS, Lucide Icons.
- **On-Device Edge AI**: ONNX Runtime Web (WASM SIMD) + Native Client-side Decision Trees.
- **Mobile Packaging**: Capacitor 7 (Android Native Camera HAL, Offline Storage, Filesystem & Native Sharing).
- **Report Generation**: `pdf-lib` (client-side A4 clinical certificate generation).
- **Zero-Cloud Guarantee**: Operates completely in airplane mode with no external servers, APIs, or data transmission.
