import os
import shutil
from ultralytics import YOLO

DATASET_YAML = r"c:\Users\bhara\projects\ELISA\dataset\data.yaml"
OUTPUT_MODEL_DIR = r"c:\Users\bhara\projects\ELISA\models"
FINAL_MODEL_PATH = os.path.join(OUTPUT_MODEL_DIR, "yolov8_wssa_wells.pt")

def train():
    os.makedirs(OUTPUT_MODEL_DIR, exist_ok=True)
    print("Initializing YOLOv8 Nano model for well detection...")
    model = YOLO("yolov8n.pt")
    
    print("Starting YOLOv8 training on DINO-labeled ELISA wells...")
    results = model.train(
        data=DATASET_YAML,
        epochs=20,
        imgsz=640,
        batch=8,
        device="cpu",
        workers=2,
        project="yolo_runs",
        name="elisa_well_detector",
        exist_ok=True,
        verbose=True
    )
    
    best_pt = os.path.join("yolo_runs", "elisa_well_detector", "weights", "best.pt")
    if os.path.exists(best_pt):
        shutil.copy(best_pt, FINAL_MODEL_PATH)
        print(f"\nTraining Complete! Best model saved to: {FINAL_MODEL_PATH}")
    else:
        print(f"Warning: best.pt not found at {best_pt}")
        
    # Validate
    val_results = model.val()
    print(f"Validation mAP50: {val_results.box.map50:.4f}")
    print(f"Validation mAP50-95: {val_results.box.map:.4f}")

if __name__ == "__main__":
    train()
