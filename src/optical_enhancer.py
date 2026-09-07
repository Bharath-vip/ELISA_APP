import cv2
import numpy as np
import pandas as pd

def get_trimmed_well_pixels(bgr_img, lab_img, hsv_img, cx, cy, radius, trim_percent=10):
    """
    Extracts pixels from a well circle with multi-ring annular concentric masks
    and luminance trimming (discarding specular glare and wall shadows).
    """
    h, w = bgr_img.shape[:2]
    
    mask_full = np.zeros((h, w), dtype=np.uint8)
    mask_core = np.zeros((h, w), dtype=np.uint8)
    mask_mid = np.zeros((h, w), dtype=np.uint8)
    mask_outer = np.zeros((h, w), dtype=np.uint8)
    
    r_core = int(0.35 * radius)
    r_mid = int(0.70 * radius)
    r_outer = int(0.92 * radius)
    
    cv2.circle(mask_full, (cx, cy), r_outer, 255, -1)
    cv2.circle(mask_core, (cx, cy), r_core, 255, -1)
    cv2.circle(mask_mid, (cx, cy), r_mid, 255, -1)
    cv2.circle(mask_outer, (cx, cy), r_outer, 255, -1)
    
    mask_ring3 = cv2.bitwise_and(mask_outer, cv2.bitwise_not(mask_mid))
    
    all_bgr = bgr_img[mask_full == 255]
    if len(all_bgr) < 20:
        return None
        
    all_lab = lab_img[mask_full == 255]
    all_hsv = hsv_img[mask_full == 255]
    
    lum = all_lab[:, 0]
    p10 = np.percentile(lum, trim_percent)
    p90 = np.percentile(lum, 100 - trim_percent)
    clean = (lum >= p10) & (lum <= p90)
    if np.sum(clean) < 10:
        clean = np.ones(len(all_bgr), dtype=bool)
        
    b_med = float(np.median(all_bgr[clean, 0]))
    g_med = float(np.median(all_bgr[clean, 1]))
    r_med = float(np.median(all_bgr[clean, 2]))
    l_med = float(np.median(all_lab[clean, 0]))
    a_med = float(np.median(all_lab[clean, 1]))
    b_star = float(np.median(all_lab[clean, 2]))
    s_med = float(np.median(all_hsv[clean, 1]))
    v_med = float(np.median(all_hsv[clean, 2]))
    
    # Annular liquid depth profile
    pix_core = bgr_img[mask_core == 255]
    pix_outer = bgr_img[mask_ring3 == 255]
    core_blue = float(np.median(pix_core[:, 0])) if len(pix_core) > 5 else b_med
    outer_blue = float(np.median(pix_outer[:, 0])) if len(pix_outer) > 5 else b_med
    meniscus_depth_ratio = max(core_blue, 1.0) / max(outer_blue, 1.0)
    
    return {
        "b_med": b_med, "g_med": g_med, "r_med": r_med,
        "l_med": l_med, "a_med": a_med, "b_star": b_star,
        "h_med": float(np.median(all_hsv[clean, 0])),
        "s_med": s_med, "v_med": v_med,
        "core_blue": core_blue, "outer_blue": outer_blue,
        "meniscus_depth_ratio": meniscus_depth_ratio,
        "cx": cx, "cy": cy
    }

def fit_2d_illumination_surface(well_data_dict, plastic_samples=None):
    """
    Fits 2D second-order polynomial surfaces to model spatial lens vignetting,
    falloff, and ambient color temperature.
    Prioritizes inter-well virgin polystyrene plastic nodes when available.
    """
    surfaces = {}
    
    # 1. Plastic surface fitting
    if plastic_samples and len(plastic_samples) >= 15:
        xs_p = np.array([p["cx"] for p in plastic_samples], dtype=np.float32)
        ys_p = np.array([p["cy"] for p in plastic_samples], dtype=np.float32)
        mx_p, sx_p = np.mean(xs_p), np.std(xs_p) + 1e-5
        my_p, sy_p = np.mean(ys_p), np.std(ys_p) + 1e-5
        xn_p = (xs_p - mx_p) / sx_p
        yn_p = (ys_p - my_p) / sy_p
        A_p = np.column_stack([xn_p**2, yn_p**2, xn_p * yn_p, xn_p, yn_p, np.ones(len(xs_p))])
        ATA_p = A_p.T @ A_p + 0.5 * np.eye(6)
        
        for ch in ["b", "g", "r"]:
            vals = np.array([p[ch] for p in plastic_samples], dtype=np.float32)
            coeffs = np.linalg.solve(ATA_p, A_p.T @ vals)
            surfaces[f"plastic_{ch}"] = (coeffs, mx_p, sx_p, my_p, sy_p)
            
    # 2. Blank well surface fitting (for well-to-well relative baseline)
    sats = [v["s_med"] for v in well_data_dict.values()]
    threshold_sat = np.percentile(sats, 18)
    blanks = [v for v in well_data_dict.values() if v["s_med"] <= max(threshold_sat, 15.0)]
    if len(blanks) < 6:
        sorted_s = sorted(well_data_dict.values(), key=lambda v: v["s_med"])
        blanks = sorted_s[:max(6, int(len(sorted_s) * 0.15))]
        
    xs = np.array([b["cx"] for b in blanks], dtype=np.float32)
    ys = np.array([b["cy"] for b in blanks], dtype=np.float32)
    mx, sx = np.mean(xs), np.std(xs) + 1e-5
    my, sy = np.mean(ys), np.std(ys) + 1e-5
    xn = (xs - mx) / sx
    yn = (ys - my) / sy
    A = np.column_stack([xn**2, yn**2, xn * yn, xn, yn, np.ones(len(xs))])
    ATA = A.T @ A + 0.5 * np.eye(6)
    
    for channel in ["b_med", "g_med", "r_med", "b_star", "s_med", "core_blue"]:
        vals = np.array([b[channel] for b in blanks], dtype=np.float32)
        coeffs = np.linalg.solve(ATA, A.T @ vals)
        surfaces[channel] = (coeffs, mx, sx, my, sy)
        
    return surfaces

def evaluate_illumination_surface(surfaces, channel, cx, cy):
    if channel not in surfaces:
        return 128.0
    coeffs, mx, sx, my, sy = surfaces[channel]
    xn = (cx - mx) / sx
    yn = (cy - my) / sy
    feat = np.array([xn**2, yn**2, xn * yn, xn, yn, 1.0])
    return max(float(np.dot(coeffs, feat)), 1.0)

def extract_advanced_optical_features(well_data_dict, surfaces):
    """
    Computes local baseline-corrected, dual-wavelength differential absorbance,
    radiometrically linearized photon flux, inter-well plastic normalizations,
    and multi-spectral chromaticity features.
    """
    feature_rows = []
    has_plastic = "plastic_b" in surfaces
    
    for (r_name, c_num), data in well_data_dict.items():
        cx = data["cx"]
        cy = data["cy"]
        
        base_blue = evaluate_illumination_surface(surfaces, "b_med", cx, cy)
        base_green = evaluate_illumination_surface(surfaces, "g_med", cx, cy)
        base_red = evaluate_illumination_surface(surfaces, "r_med", cx, cy)
        base_bstar = evaluate_illumination_surface(surfaces, "b_star", cx, cy)
        base_sat = evaluate_illumination_surface(surfaces, "s_med", cx, cy)
        base_core = evaluate_illumination_surface(surfaces, "core_blue", cx, cy)
        
        b = data["b_med"]
        g = data["g_med"]
        r = data["r_med"]
        l_med = data["l_med"]
        a_med = data["a_med"]
        b_star = data["b_star"]
        s_med = data["s_med"]
        
        # 1. Standard sRGB Absorbances
        a_blue = -np.log10(max(b, 1.0) / max(base_blue, 1.0))
        a_green = -np.log10(max(g, 1.0) / max(base_green, 1.0))
        a_red = -np.log10(max(r, 1.0) / max(base_red, 1.0))
        a_diff = a_blue - a_red
        a_green_diff = a_green - a_red
        
        # 2. Radiometrically Linearized Photon Absorbance (Inverse Gamma 2.2)
        b_lin = (b / 255.0) ** 2.2
        r_lin = (r / 255.0) ** 2.2
        g_lin = (g / 255.0) ** 2.2
        base_b_lin = (base_blue / 255.0) ** 2.2
        base_r_lin = (base_red / 255.0) ** 2.2
        base_g_lin = (base_green / 255.0) ** 2.2
        
        a_blue_lin = -np.log10(max(b_lin, 1e-4) / max(base_b_lin, 1e-4))
        a_red_lin = -np.log10(max(r_lin, 1e-4) / max(base_r_lin, 1e-4))
        a_green_lin = -np.log10(max(g_lin, 1e-4) / max(base_g_lin, 1e-4))
        a_diff_lin = a_blue_lin - a_red_lin
        a_green_diff_lin = a_green_lin - a_red_lin
        
        # 3. Inter-Well Plastic Normalization (Physical Invariant Reference)
        if has_plastic:
            plast_b = evaluate_illumination_surface(surfaces, "plastic_b", cx, cy)
            plast_g = evaluate_illumination_surface(surfaces, "plastic_g", cx, cy)
            plast_r = evaluate_illumination_surface(surfaces, "plastic_r", cx, cy)
        else:
            plast_b, plast_g, plast_r = base_blue, base_green, base_red
            
        t_plast_b = max(b, 1.0) / max(plast_b, 1.0)
        t_plast_g = max(g, 1.0) / max(plast_g, 1.0)
        t_plast_r = max(r, 1.0) / max(plast_r, 1.0)
        a_plast_diff = -np.log10(t_plast_b) - (-np.log10(t_plast_r))
        a_plast_green_diff = -np.log10(t_plast_g) - (-np.log10(t_plast_r))
        
        # 4. Meniscus Liquid Depth
        a_core_blue = -np.log10(max(data["core_blue"], 1.0) / max(base_core, 1.0))
        
        # 5. Chromatic Polar Coordinates & Ratios
        delta_bstar = b_star - base_bstar
        bstar_norm = b_star / max(l_med, 1.0)
        chroma = np.sqrt(a_med**2 + b_star**2)
        hue_angle = np.arctan2(b_star, a_med)
        chroma_l_ratio = chroma / max(l_med, 1.0)
        
        ndyi = (r + g - 2.0 * b) / (r + g + 2.0 * b + 1e-5)
        rb_ratio = r / max(b, 1.0)
        gb_ratio = g / max(b, 1.0)
        rg_ratio = r / max(g, 1.0)
        rel_sat = s_med / max(base_sat, 1.0)
        
        # Spectrophotometer Simulated Absorbance Index
        ssai = a_diff_lin / (1.0 + 0.30 * max(a_green_diff_lin, 0.0))
        aar = (max(a_green_diff, 0.0) + 0.01) / (max(a_diff, 0.0) + 0.05)
        
        feature_rows.append({
            "Row": r_name,
            "Col": c_num,
            "A_Diff_Linear": a_diff_lin,
            "A_Blue_Linear": a_blue_lin,
            "A_Green_Diff_Linear": a_green_diff_lin,
            "A_Diff": a_diff,
            "A_Blue": a_blue,
            "A_Green_Diff": a_green_diff,
            "A_Plast_Diff": a_plast_diff,
            "A_Plast_Green_Diff": a_plast_green_diff,
            "T_Plast_Blue": t_plast_b,
            "T_Plast_Green": t_plast_g,
            "T_Plast_Red": t_plast_r,
            "A_Core_Blue": a_core_blue,
            "Meniscus_Depth_Ratio": data["meniscus_depth_ratio"],
            "Delta_BStar": delta_bstar,
            "B_Star_Norm": bstar_norm,
            "Chroma": chroma,
            "Hue_Angle": hue_angle,
            "Chroma_L_Ratio": chroma_l_ratio,
            "SSAI": ssai,
            "AAR": aar,
            "NDYI": ndyi,
            "RB_Ratio": rb_ratio,
            "GB_Ratio": gb_ratio,
            "RG_Ratio": rg_ratio,
            "Rel_Sat": rel_sat,
            "Blue_Med": b,
            "Green_Med": g,
            "Red_Med": r,
            "L_Med": l_med,
            "A_Med": a_med,
            "B_Star_Med": b_star,
            "S_Med": s_med,
            "V_Med": data["v_med"]
        })
        
    return pd.DataFrame(feature_rows)
