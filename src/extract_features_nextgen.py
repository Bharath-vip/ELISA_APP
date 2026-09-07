import os
import sys
import glob
import cv2
import numpy as np
import pandas as pd
from PIL import Image, ImageOps

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

from parse_matrices import parse_single_excel
from well_extractor import detect_plate_wells, extract_interwell_plastic_samples
from optical_enhancer import get_trimmed_well_pixels, fit_2d_illumination_surface, extract_advanced_optical_features

DATA_DIR = r"C:\Users\bhara\projects\ELISA\ELISA Data Set"
OUTPUT_DIR = r"c:\Users\bhara\projects\ELISA\data"
os.makedirs(OUTPUT_DIR, exist_ok=True)

PLATE_COLS = {
    "plate 0001": 10,
    "Plate 0002": 11,
    "plate 0003": 10,
    "Plate 0004": 12,
    "Plate 0005": 12,
    "Plate 0006": 10,
    "Plate 0007": 12,
    "Plate 0008": 7,
}

ROTATION_OVERRIDES = {
    "Plate A 0007.jpg": 90,
    "Plate C 0007.jpg": 180,
    "Plate C 0003.jpg": 90,
}

def load_oriented_image(img_path):
    filename = os.path.basename(img_path)
    pil_img = Image.open(img_path)
    pil_img = ImageOps.exif_transpose(pil_img)
    rot = ROTATION_OVERRIDES.get(filename, None)
    if rot is not None:
        pil_img = pil_img.rotate(rot, expand=True)
    elif pil_img.size[1] > pil_img.size[0]:
        pil_img = pil_img.rotate(270, expand=True)
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

def main():
    print("=" * 80)
    print("EXTRACTING NEXT-GEN FEATURES: HOMOGRAPHY + INTER-WELL PLASTIC NORMALIZATION")
    print("=" * 80)
    
    all_rows = []
    
    for plate_name, num_cols in sorted(PLATE_COLS.items()):
        plate_dir = os.path.join(DATA_DIR, plate_name)
        xlsx_files = glob.glob(os.path.join(plate_dir, "*.xlsx"))
        if not xlsx_files:
            print(f"Skipping {plate_name}: no excel found")
            continue
            
        gt_dict, _ = parse_single_excel(xlsx_files[0])
            
        jpg_files = sorted(glob.glob(os.path.join(plate_dir, "*.jpg")))
        print(f"\nProcessing {plate_name} ({len(jpg_files)} photos, {num_cols} active columns)...")
        
        for img_path in jpg_files:
            fname = os.path.basename(img_path)
            bgr = load_oriented_image(img_path)
            lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
            hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
            
            # 1. Projective Homography well detection
            wells = detect_plate_wells(bgr, num_cols)
            
            # 2. Inter-well virgin polystyrene plastic sampling
            plastic_samples = extract_interwell_plastic_samples(bgr, wells, num_cols)
            
            # 3. Liquid meniscus extraction with 10%-90% luminance trimming
            well_data = {}
            for (r, c), (cx, cy, radius) in wells.items():
                data = get_trimmed_well_pixels(bgr, lab, hsv, cx, cy, radius, trim_percent=10)
                if data is not None:
                    well_data[(r, c)] = data
                    
            if len(well_data) < 20:
                print(f"  Warning: {fname} only extracted {len(well_data)} wells.")
                continue
                
            # 4. Fit 2D Illumination Surface on plastic + blanks
            surfaces = fit_2d_illumination_surface(well_data, plastic_samples)
            
            # 5. Extract advanced physical optical features
            feat_df = extract_advanced_optical_features(well_data, surfaces)
            
            # 6. Map true OD
            feat_df["Plate"] = plate_name
            feat_df["Photo"] = fname
            feat_df["True_OD"] = feat_df.apply(lambda r: gt_dict.get((r["Row"], int(r["Col"])), np.nan), axis=1)
            feat_df = feat_df.dropna(subset=["True_OD"])
            
            all_rows.append(feat_df)
            print(f"  ✓ {fname}: {len(feat_df)} wells extracted | {len(plastic_samples)} plastic reference nodes")
            
    final_df = pd.concat(all_rows, ignore_index=True)
    out_csv = os.path.join(OUTPUT_DIR, "wssa_nextgen_features_dataset.csv")
    final_df.to_csv(out_csv, index=False)
    
    print("\n" + "=" * 80)
    print(f"EXTRACTION COMPLETE: {len(final_df)} total wells extracted across {len(final_df['Photo'].unique())} photos.")
    print(f"Saved to: {out_csv}")
    print(f"Columns ({len(final_df.columns)}): {list(final_df.columns)}")
    print("=" * 80)

if __name__ == "__main__":
    main()
