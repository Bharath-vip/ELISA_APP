import os
import numpy as np
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
import matplotlib.pyplot as plt

def evaluate_plate_diagnostics(well_results, plate_id="Plate 0001", client_name="Shrimp Farm A"):
    """
    well_results: dict of {(row, col): {"predicted_od": float, "true_od": float}}
    """
    ods = [v["predicted_od"] for v in well_results.values()]
    
    # 1. Negative controls: bottom 15% OD wells or wells with OD < 0.15
    threshold = np.percentile(ods, 15)
    neg_controls = [v["predicted_od"] for v in well_results.values() if v["predicted_od"] <= max(threshold, 0.12)]
    if not neg_controls:
        neg_controls = [min(ods)]
        
    mean_neg = float(np.mean(neg_controls))
    sd_neg = float(np.std(neg_controls)) if len(neg_controls) > 1 else 0.02
    
    # Qualitative Cut-off formula
    cutoff_val = mean_neg + (3 * sd_neg)
    
    diagnostics = {}
    positive_count = 0
    negative_count = 0
    
    for (r, c), data in well_results.items():
        pred_od = data["predicted_od"]
        is_pos = pred_od > cutoff_val
        if is_pos:
            positive_count += 1
            status = "POSITIVE"
        else:
            negative_count += 1
            status = "NEGATIVE"
            
        diagnostics[(r, c)] = {
            "predicted_od": pred_od,
            "true_od": data.get("true_od", None),
            "status": status,
            "is_positive": is_pos
        }
        
    summary = {
        "plate_id": plate_id,
        "client_name": client_name,
        "total_wells": len(well_results),
        "mean_negative": mean_neg,
        "sd_negative": sd_neg,
        "cutoff_value": cutoff_val,
        "positive_wells": positive_count,
        "negative_wells": negative_count,
        "outbreak_alert": positive_count > 0
    }
    
    return diagnostics, summary

def generate_pdf_report(diagnostics, summary, output_pdf_path, heatmap_img_path=None):
    doc = SimpleDocTemplate(output_pdf_path, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0F172A')
    )
    
    sub_style = ParagraphStyle(
        'SubStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#0284C7')
    )
    
    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#334155')
    )
    
    elements = []
    
    # Header
    elements.append(Paragraph("AQUACULTURE POCT DIAGNOSTIC CERTIFICATE", sub_style))
    elements.append(Paragraph(f"White Spot Syndrome Assay (WSSA) Report: {summary['plate_id']}", title_style))
    elements.append(Spacer(1, 10))
    
    # Meta Table
    alert_color = "#DC2626" if summary["outbreak_alert"] else "#16A34A"
    alert_text = "🚨 OUTBREAK WARNING (WSSV Detected)" if summary["outbreak_alert"] else "✅ HEALTHY CROP (All Wells Below Cut-off)"
    
    meta_data = [
        [Paragraph("<b>Sample Location / Farm:</b>", body_style), Paragraph(summary["client_name"], body_style),
         Paragraph("<b>Cut-Off Threshold:</b>", body_style), Paragraph(f"{summary['cutoff_value']:.4f} OD", body_style)],
        [Paragraph("<b>Negative Control Mean:</b>", body_style), Paragraph(f"{summary['mean_negative']:.4f} OD (SD: {summary['sd_negative']:.4f})", body_style),
         Paragraph("<b>Total Wells Analyzed:</b>", body_style), Paragraph(str(summary["total_wells"]), body_style)],
        [Paragraph("<b>Overall Pond Status:</b>", body_style), 
         Paragraph(f"<font color='{alert_color}'><b>{alert_text}</b></font>", body_style),
         Paragraph("<b>Positive / Negative:</b>", body_style), 
         Paragraph(f"<font color='#DC2626'><b>{summary['positive_wells']} POS</b></font> / <font color='#16A34A'><b>{summary['negative_wells']} NEG</b></font>", body_style)]
    ]
    
    meta_table = Table(meta_data, colWidths=[130, 150, 120, 140])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 14))
    
    # Add Heatmap if present
    if heatmap_img_path and os.path.exists(heatmap_img_path):
        elements.append(Paragraph("<b>8×12 Microplate Diagnostic Heatmap:</b>", body_style))
        elements.append(Spacer(1, 4))
        elements.append(RLImage(heatmap_img_path, width=540, height=220))
        elements.append(Spacer(1, 14))
        
    # Table of first 20 well readings
    elements.append(Paragraph("<b>Selected Well Optical Density & Status Log:</b>", body_style))
    elements.append(Spacer(1, 4))
    
    table_rows = [["Well", "Predicted OD", "True OD (Ref)", "Variance", "Diagnostic Status"]]
    sorted_wells = sorted(diagnostics.keys(), key=lambda x: (x[0], x[1]))
    
    for (r, c) in sorted_wells[:16]:
        d = diagnostics[(r, c)]
        p_od = d["predicted_od"]
        t_od = d["true_od"]
        t_str = f"{t_od:.3f}" if t_od is not None else "N/A"
        diff_str = f"{abs(p_od - t_od):.3f}" if t_od is not None else "N/A"
        stat_color = "#DC2626" if d["is_positive"] else "#16A34A"
        
        stat_cell = Paragraph(f"<font color='{stat_color}'><b>{d['status']}</b></font>", body_style)
        table_rows.append([f"{r}{c}", f"{p_od:.3f}", t_str, diff_str, stat_cell])
        
    report_table = Table(table_rows, colWidths=[60, 100, 100, 100, 180])
    report_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0F172A')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 8.5),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
    ]))
    elements.append(report_table)
    
    elements.append(Spacer(1, 16))
    elements.append(Paragraph("<i>Report generated automatically by WSSA Mobile AI Reader • Spec v2.0 • Offline Point-of-Care Testing</i>", body_style))
    
    doc.build(elements)
    print(f"PDF Diagnostic Report successfully generated at: {output_pdf_path}")

def render_plate_heatmap(diagnostics, output_png_path):
    rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    cols = sorted(list(set([k[1] for k in diagnostics.keys()])))
    
    matrix = np.zeros((8, len(cols)))
    for r_idx, r in enumerate(rows):
        for c_idx, c in enumerate(cols):
            if (r, c) in diagnostics:
                matrix[r_idx, c_idx] = diagnostics[(r, c)]["predicted_od"]
                
    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=200)
    fig.patch.set_facecolor('#FFFFFF')
    ax.set_facecolor('#F8FAFC')
    
    im = ax.imshow(matrix, cmap='YlOrRd', aspect='auto')
    
    ax.set_xticks(np.arange(len(cols)))
    ax.set_yticks(np.arange(len(rows)))
    ax.set_xticklabels([str(c) for c in cols], fontweight='bold', fontsize=9)
    ax.set_yticklabels(rows, fontweight='bold', fontsize=9)
    
    # Annotate values
    for i in range(len(rows)):
        for j in range(len(cols)):
            val = matrix[i, j]
            text_color = "white" if val > 1.8 else "black"
            ax.text(j, i, f"{val:.2f}", ha="center", va="center", color=text_color, fontsize=7.5, fontweight='bold')
            
    cbar = fig.colorbar(im, ax=ax, shrink=0.85)
    cbar.ax.set_ylabel('Predicted OD', rotation=-90, va="bottom", fontweight='bold', fontsize=9)
    
    plt.title("Predicted Optical Density (OD) Microplate Heatmap", fontsize=11, fontweight='bold', pad=8)
    plt.tight_layout()
    plt.savefig(output_png_path, dpi=200, bbox_inches='tight')
    plt.close()

if __name__ == "__main__":
    # Quick self-test
    mock_results = {}
    rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    for r in rows:
        for c in range(1, 11):
            pred = 0.05 + 0.3 * np.random.rand() if c > 3 else 1.5 + 1.2 * np.random.rand()
            mock_results[(r, c)] = {"predicted_od": float(pred), "true_od": float(pred + 0.02 * np.random.randn())}
            
    diag, summ = evaluate_plate_diagnostics(mock_results, "Plate 0001 (Test)", "AquaFarm Pond 4")
    render_plate_heatmap(diag, "assets/sample_heatmap.png")
    generate_pdf_report(diag, summ, "assets/sample_wssa_report.pdf", "assets/sample_heatmap.png")
