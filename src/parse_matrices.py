import os
import glob
import pandas as pd
import numpy as np

DATA_DIR = r"C:\Users\bhara\projects\ELISA\ELISA Data Set"
OUTPUT_DIR = r"c:\Users\bhara\projects\ELISA\data"
os.makedirs(OUTPUT_DIR, exist_ok=True)

ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

def parse_single_excel(xlsx_path):
    df = pd.read_excel(xlsx_path, header=None)
    
    # 1. Find where rows A through H are located
    row_indices = {}
    col_start_idx = None
    
    for r_idx in range(len(df)):
        row_vals = [str(x).strip() for x in df.iloc[r_idx].values]
        for row_letter in ROWS:
            if row_letter in row_vals and row_letter not in row_indices:
                col_pos = row_vals.index(row_letter)
                row_indices[row_letter] = (r_idx, col_pos)
                
    if len(row_indices) < 8:
        raise ValueError(f"Could not find all 8 rows A-H in {xlsx_path}. Found: {list(row_indices.keys())}")
        
    # Col position where 'A' is found is the row-label column
    label_col = row_indices['A'][1]
    
    # Now look for numbers to the right of label_col
    first_data_row = row_indices['A'][0]
    
    # Determine columns by looking above or in the data rows
    # Let's see which columns have valid numbers across rows A-H
    valid_cols = []
    for c in range(label_col + 1, df.shape[1]):
        col_vals = []
        for r_letter in ROWS:
            r = row_indices[r_letter][0]
            val = df.iloc[r, c]
            try:
                num = float(val)
                if not np.isnan(num):
                    col_vals.append(num)
            except (ValueError, TypeError):
                pass
        if len(col_vals) >= 6: # At least 6 of the 8 rows have numeric values
            valid_cols.append(c)
            
    # Build dictionary of { (Row, ColNumber): OD_Value }
    od_dict = {}
    for col_num_idx, c in enumerate(valid_cols, start=1):
        for r_letter in ROWS:
            r = row_indices[r_letter][0]
            val = float(df.iloc[r, c])
            od_dict[(r_letter, col_num_idx)] = val
            
    return od_dict, len(valid_cols)

def parse_all_plates():
    subdirs = sorted([d for d in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, d))])
    all_data = []
    
    print("Parsing Excel matrices across all plates...")
    for sub in subdirs:
        subpath = os.path.join(DATA_DIR, sub)
        xlsx_files = glob.glob(os.path.join(subpath, "*.xlsx")) + glob.glob(os.path.join(subpath, "*.xls"))
        if not xlsx_files:
            continue
        xlsx_path = xlsx_files[0]
        try:
            od_dict, num_cols = parse_single_excel(xlsx_path)
            print(f"  [OK] {sub}: {num_cols} columns ({len(od_dict)} wells)")
            for (r, c), od in od_dict.items():
                all_data.append({
                    "Plate": sub,
                    "Row": r,
                    "Col": c,
                    "Well": f"{r}{c}",
                    "True_OD": od
                })
        except Exception as e:
            print(f"  [ERROR] {sub}: {e}")
            
    df_all = pd.DataFrame(all_data)
    out_csv = os.path.join(OUTPUT_DIR, "ground_truth_all_plates.csv")
    df_all.to_csv(out_csv, index=False)
    print(f"\nSaved complete ground-truth matrix to: {out_csv}")
    print(f"Total parsed wells: {len(df_all)}")
    return df_all

if __name__ == "__main__":
    parse_all_plates()
