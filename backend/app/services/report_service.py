"""
Report Generation Service
Generates PDF (WeasyPrint) and DOCX (python-docx) compliance reports.
SHA-256 hash is computed on the generated file for evidentiary integrity.
Reports are immutable — regeneration creates a new report with superseded_by link.
"""
import hashlib
import io
import logging
import os
import uuid
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# WeasyPrint and python-docx are imported lazily inside functions
# to avoid crashing at startup when native GTK libs are missing (Windows).
WEASYPRINT_AVAILABLE = None  # None = not yet checked
DOCX_AVAILABLE = None


def _check_weasyprint() -> bool:
    global WEASYPRINT_AVAILABLE
    if WEASYPRINT_AVAILABLE is None:
        try:
            import weasyprint  # noqa: F401
            WEASYPRINT_AVAILABLE = True
        except Exception:
            WEASYPRINT_AVAILABLE = False
            logger.warning("WeasyPrint not available — PDF generation disabled.")
    return bool(WEASYPRINT_AVAILABLE)


def _check_docx() -> bool:
    global DOCX_AVAILABLE
    if DOCX_AVAILABLE is None:
        try:
            from docx import Document  # noqa: F401
            DOCX_AVAILABLE = True
        except Exception:
            DOCX_AVAILABLE = False
            logger.warning("python-docx not available — DOCX generation disabled.")
    return bool(DOCX_AVAILABLE)


def _sha256_of_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


from PIL import Image
import base64


def _crop_bounding_box(image_path: Optional[str], bbox: Optional[dict]) -> Optional[bytes]:
    """
    Given an image path and a normalized bounding box dict {'x_min', 'y_min', 'x_max', 'y_max'},
    crop the image using Pillow and return JPEG bytes in memory.
    """
    if not image_path or not os.path.exists(image_path) or not bbox:
        return None
    try:
        with Image.open(image_path) as img:
            w, h = img.size
            x_min = bbox.get("x_min", 0.0)
            y_min = bbox.get("y_min", 0.0)
            x_max = bbox.get("x_max", 1.0)
            y_max = bbox.get("y_max", 1.0)

            if isinstance(x_min, (int, float)) and isinstance(x_max, (int, float)) and x_max > x_min and y_max > y_min:
                left = int(max(0, min(w, x_min * w if x_min <= 1.0 else x_min)))
                top = int(max(0, min(h, y_min * h if y_min <= 1.0 else y_min)))
                right = int(max(0, min(w, x_max * w if x_max <= 1.0 else x_max)))
                bottom = int(max(0, min(h, y_max * h if y_max <= 1.0 else y_max)))

                # Add small padding if too tight
                pad = 4
                left = max(0, left - pad)
                top = max(0, top - pad)
                right = min(w, right + pad)
                bottom = min(h, bottom + pad)

                if right > left and bottom > top:
                    cropped = img.crop((left, top, right, bottom))
                    buf = io.BytesIO()
                    cropped.convert("RGB").save(buf, format="JPEG", quality=85)
                    return buf.getvalue()
    except Exception as e:
        logger.warning("Failed to crop image evidence from %s: %s", image_path, e)
    return None


def _get_image_path_for_check(scan, image_index: Optional[int]) -> Optional[str]:
    paths = getattr(scan, "image_paths", None)
    if paths and isinstance(paths, list) and image_index is not None and 0 <= image_index < len(paths):
        return paths[image_index]
    return getattr(scan, "image_path", None)


def _build_report_html(scan, findings: list) -> str:
    """Build the HTML string used for PDF rendering."""
    checks = getattr(scan, "compliance_checks", []) or []
    
    field_rows = ""
    evidence_cards = ""
    
    if checks:
        for check in checks:
            key = getattr(check, "field_key", "")
            label = key.replace("_", " ").title()
            res_obj = getattr(check, "result", None)
            res_val = res_obj.value if hasattr(res_obj, "value") else str(res_obj or "—")
            extracted = getattr(check, "extracted_value", None) or "—"
            conf = getattr(check, "confidence", None)
            conf_str = f"{int(conf * 100)}%" if conf is not None else "—"
            
            color = "#1a7a3c" if res_val in ("Pass", "Relaxed") else ("#c0392b" if res_val == "Fail" else "#e67e22")
            field_rows += f"""
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">{label}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;">{extracted}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;">{conf_str}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;color:{color};font-weight:bold;">{res_val}</td>
            </tr>"""
            
            bbox = getattr(check, "bounding_box", None)
            # Vision-estimated boxes are not ground-truth localization. Do not
            # publish a misleading crop; only OCR-confirmed boxes are cropped.
            if bbox and bbox.get("bbox_source") != "vision_estimate":
                img_path = _get_image_path_for_check(scan, getattr(check, "image_index", 0))
                crop_bytes = _crop_bounding_box(img_path, bbox)
                if crop_bytes:
                    b64 = base64.b64encode(crop_bytes).decode("utf-8")
                    source_label = "Vision Estimate (approximate)" if bbox.get("bbox_source") == "vision_estimate" else "OCR Word Match (precise)"
                    evidence_cards += f"""
                    <div style="display:inline-block;vertical-align:top;margin:8px;padding:8px;border:1px solid #e0e0e0;border-radius:4px;width:200px;background:#fafafa;">
                      <div style="font-weight:bold;font-size:11px;color:#003580;margin-bottom:4px;">{label}</div>
                      <img src="data:image/jpeg;base64,{b64}" style="width:100%;height:100px;object-fit:contain;background:#fff;border:1px solid #ddd;border-radius:2px;" alt="{label} crop"/>
                      <div style="font-size:10px;color:#666;margin-top:4px;">Result: <b style="color:{color};">{res_val}</b> ({conf_str})</div>
                      <div style="font-size:9px;color:#888;font-style:italic;">{source_label}</div>
                    </div>"""

    elif scan.field_results:
        for key, present in scan.field_results.items():
            label = key.replace("_", " ").title()
            status = "Pass" if present else "Fail"
            color = "#1a7a3c" if present else "#c0392b"
            extracted = (scan.extracted_fields or {}).get(key, "—")
            field_rows += f"""
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">{label}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;">{extracted}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;">—</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;color:{color};font-weight:bold;">{status}</td>
            </tr>"""

    finding_rows = ""
    for f in findings:
        sev_color = {"critical": "#c0392b", "high": "#e67e22", "medium": "#f39c12", "low": "#27ae60"}.get(f.get("severity", "medium"), "#888")
        finding_rows += f"""
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">{f.get('rule_code','—')}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">{f.get('finding_type','').upper()}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:{sev_color};font-weight:bold;">{f.get('severity','').upper()}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">{f.get('description','')}</td>
        </tr>"""

    summary = scan.compliance_summary or {}
    headline = summary.get("headline") if isinstance(summary, dict) else None
    compliance_color = "#e67e22" if headline == "NeedsManualReview" else ("#1a7a3c" if headline == "AllPass" else "#c0392b")
    compliance_label = "NEEDS REVIEW" if headline == "NeedsManualReview" else ("COMPLIANT" if headline == "AllPass" else "NON-COMPLIANT")

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body {{ font-family: Arial, sans-serif; font-size: 13px; margin: 0; padding: 0; color: #222; }}
  .header {{ background: #003580; color: white; padding: 20px 30px; }}
  .header h1 {{ margin: 0; font-size: 18px; }}
  .header p {{ margin: 4px 0 0; font-size: 11px; opacity: 0.8; }}
  .saffron {{ background: #FF6B00; height: 4px; }}
  .content {{ padding: 24px 30px; }}
  .badge {{ display: inline-block; background: {compliance_color}; color: white;
             padding: 6px 18px; border-radius: 4px; font-weight: bold; font-size: 14px; }}
  .section-title {{ font-size: 13px; font-weight: bold; color: #003580;
                    text-transform: uppercase; letter-spacing: 0.05em;
                    border-bottom: 2px solid #003580; padding-bottom: 4px; margin: 20px 0 10px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ background: #f3f4f6; font-size: 11px; text-align: left; padding: 8px 10px;
        text-transform: uppercase; letter-spacing: 0.04em; color: #555; }}
  .footer {{ margin-top: 40px; font-size: 10px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }}
  .meta-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }}
  .meta-item dt {{ font-size: 10px; color: #888; text-transform: uppercase; }}
  .meta-item dd {{ font-size: 13px; font-weight: 600; margin: 0; }}
</style>
</head>
<body>
<div class="saffron"></div>
<div class="header">
  <h1>🇮🇳 Legal Metrology Compliance Report</h1>
  <p>Ministry of Consumer Affairs, Food &amp; Public Distribution · LM (PC) Rules, 2011</p>
</div>
<div class="content">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
    <div>
      <h2 style="margin:0;font-size:20px;">{scan.product_name or 'Unknown Product'}</h2>
      <p style="margin:4px 0 0;color:#888;font-size:11px;font-family:monospace;">Scan ID: {scan.scan_id}</p>
    </div>
    <span class="badge">{compliance_label} · {scan.compliance_score:.1f}%</span>
  </div>

  <div class="section-title">Scan Details</div>
  <dl class="meta-grid">
    <div class="meta-item"><dt>Category</dt><dd>{scan.category or '—'}</dd></div>
    <div class="meta-item"><dt>Shop Name</dt><dd>{scan.shop_name or '—'}</dd></div>
    <div class="meta-item"><dt>Location</dt><dd>{scan.location or '—'}</dd></div>
    <div class="meta-item"><dt>State / District</dt><dd>{(scan.state or '—')} / {(scan.district or '—')}</dd></div>
    <div class="meta-item"><dt>OCR Confidence</dt><dd>{(scan.ocr_confidence or 0):.1f}%</dd></div>
    <div class="meta-item"><dt>Scan Date</dt><dd>{scan.created_at.strftime('%d %b %Y, %H:%M') if scan.created_at else '—'}</dd></div>
  </dl>

  <div class="section-title">Declaration Compliance (Rule 6)</div>
  <table>
    <thead><tr><th>Field</th><th>Extracted Value</th><th>Confidence</th><th>Status</th></tr></thead>
    <tbody>{field_rows}</tbody>
  </table>

  {f'''<div class="section-title">Visual Evidence (Declaration Crops)</div>
  <div style="margin-top:8px;">
    {evidence_cards}
  </div>''' if evidence_cards else ''}

  {f'''<div class="section-title">Manual Findings</div>
  <table>
    <thead><tr><th>Rule Code</th><th>Type</th><th>Severity</th><th>Description</th></tr></thead>
    <tbody>{finding_rows}</tbody>
  </table>''' if findings else ''}

  <div class="section-title">Remarks</div>
  <p>{scan.remarks or 'No remarks.'}</p>

  <div class="footer">
    Report generated on {datetime.utcnow().strftime('%d %b %Y at %H:%M UTC')} · 
    Legal Metrology (Packaged Commodities) Rules, 2011 · NIC · SIH 2026
  </div>
</div>
</body>
</html>"""


def _build_report_docx(scan, findings: list) -> bytes:
    """Build DOCX report as bytes with embedded image crops."""
    from docx import Document
    from docx.shared import Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    doc = Document()

    # Title
    title = doc.add_heading("Legal Metrology Compliance Report", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    sub = doc.add_paragraph("Ministry of Consumer Affairs, Food & Public Distribution")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph()

    # Product heading
    doc.add_heading(scan.product_name or "Unknown Product", level=1)
    p = doc.add_paragraph()
    p.add_run("Scan ID: ").bold = True
    p.add_run(scan.scan_id)
    p.add_run("    Status: ").bold = True
    summary = scan.compliance_summary or {}
    headline = summary.get("headline") if isinstance(summary, dict) else None
    report_label = "NEEDS REVIEW" if headline == "NeedsManualReview" else ("COMPLIANT" if headline == "AllPass" else "NON-COMPLIANT")
    run = p.add_run(report_label)
    run.bold = True
    run.font.color.rgb = RGBColor(0xe6, 0x7e, 0x22) if headline == "NeedsManualReview" else (RGBColor(0x1a, 0x7a, 0x3c) if headline == "AllPass" else RGBColor(0xc0, 0x39, 0x2b))
    p.add_run(f"  ({scan.compliance_score:.1f}%)")

    # Details table
    doc.add_heading("Scan Details", level=2)
    details = [
        ("Category", scan.category or "—"),
        ("Shop Name", scan.shop_name or "—"),
        ("Location", scan.location or "—"),
        ("State / District", f"{scan.state or '—'} / {scan.district or '—'}"),
        ("Scan Date", scan.created_at.strftime("%d %b %Y, %H:%M") if scan.created_at else "—"),
        ("OCR Confidence", f"{(scan.ocr_confidence or 0):.1f}%"),
    ]
    tbl = doc.add_table(rows=1, cols=2)
    tbl.style = "Table Grid"
    hdr = tbl.rows[0].cells
    hdr[0].text = "Field"
    hdr[1].text = "Value"
    for label, val in details:
        row = tbl.add_row().cells
        row[0].text = label
        row[1].text = val

    # Field compliance
    doc.add_heading("Declaration Compliance (Rule 6)", level=2)
    checks = getattr(scan, "compliance_checks", []) or []
    crops_to_embed = []

    if checks:
        ftbl = doc.add_table(rows=1, cols=4)
        ftbl.style = "Table Grid"
        hdr2 = ftbl.rows[0].cells
        hdr2[0].text = "Declaration"
        hdr2[1].text = "Extracted Value"
        hdr2[2].text = "Confidence"
        hdr2[3].text = "Status"
        for check in checks:
            key = getattr(check, "field_key", "")
            res_obj = getattr(check, "result", None)
            res_val = res_obj.value if hasattr(res_obj, "value") else str(res_obj or "—")
            extracted = getattr(check, "extracted_value", None) or "—"
            conf = getattr(check, "confidence", None)
            conf_str = f"{int(conf * 100)}%" if conf is not None else "—"

            r = ftbl.add_row().cells
            r[0].text = key.replace("_", " ").title()
            r[1].text = extracted
            r[2].text = conf_str
            r[3].text = res_val

            bbox = getattr(check, "bounding_box", None)
            if bbox and bbox.get("bbox_source") != "vision_estimate":
                img_path = _get_image_path_for_check(scan, getattr(check, "image_index", 0))
                crop_bytes = _crop_bounding_box(img_path, bbox)
                if crop_bytes:
                    crops_to_embed.append((key.replace("_", " ").title(), res_val, conf_str, bbox.get("bbox_source"), crop_bytes))

    elif scan.field_results:
        ftbl = doc.add_table(rows=1, cols=3)
        ftbl.style = "Table Grid"
        hdr2 = ftbl.rows[0].cells
        hdr2[0].text = "Declaration"
        hdr2[1].text = "Extracted Value"
        hdr2[2].text = "Status"
        for key, present in scan.field_results.items():
            r = ftbl.add_row().cells
            r[0].text = key.replace("_", " ").title()
            r[1].text = (scan.extracted_fields or {}).get(key, "—")
            r[2].text = "Pass" if present else "Fail"

    # Embed crops in DOCX
    if crops_to_embed:
        doc.add_heading("Declaration Evidence & Visual Crops", level=2)
        for label, res_val, conf_str, source, crop_bytes in crops_to_embed:
            src_desc = "Vision Estimate" if source == "vision_estimate" else "OCR Word Match"
            ep = doc.add_paragraph()
            ep.add_run(f"• {label}: ").bold = True
            ep.add_run(f"{res_val} (Confidence: {conf_str}, Source: {src_desc})")
            doc.add_picture(io.BytesIO(crop_bytes), width=Inches(2.5))

    # Manual findings
    if findings:
        doc.add_heading("Manual Findings", level=2)
        mtbl = doc.add_table(rows=1, cols=4)
        mtbl.style = "Table Grid"
        hdr3 = mtbl.rows[0].cells
        hdr3[0].text = "Rule Code"
        hdr3[1].text = "Type"
        hdr3[2].text = "Severity"
        hdr3[3].text = "Description"
        for f in findings:
            mr = mtbl.add_row().cells
            mr[0].text = f.get("rule_code", "—")
            mr[1].text = f.get("finding_type", "")
            mr[2].text = f.get("severity", "")
            mr[3].text = f.get("description", "")

    # Remarks
    doc.add_heading("Remarks", level=2)
    doc.add_paragraph(scan.remarks or "No remarks.")

    # Footer
    doc.add_paragraph()
    footer = doc.add_paragraph(
        f"Report generated on {datetime.utcnow().strftime('%d %b %Y at %H:%M UTC')} | "
        "Legal Metrology (Packaged Commodities) Rules, 2011 | NIC | SIH 2026"
    )
    footer.style = "Caption"

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def generate_report(scan, findings: list, fmt: str, output_dir: str,
                    user_id: Optional[int] = None) -> dict:
    """
    Generate a compliance report in the requested format.

    Args:
        scan: Scan ORM object
        findings: list of ManualFinding dicts
        fmt: "pdf" or "docx"
        output_dir: directory to save the file
        user_id: ID of user triggering generation

    Returns:
        dict with report_id, file_path, file_hash_sha256, format
    """
    report_id = str(uuid.uuid4())
    os.makedirs(output_dir, exist_ok=True)

    if fmt == "pdf":
        html_content = _build_report_html(scan, findings)
        pdf_generated = False
        if _check_weasyprint():
            try:
                from weasyprint import HTML as WeasyHTML
                pdf_bytes = WeasyHTML(string=html_content).write_pdf()
                filename = f"report_{report_id}.pdf"
                file_path = os.path.join(output_dir, filename)
                with open(file_path, "wb") as f:
                    f.write(pdf_bytes)
                file_hash = _sha256_of_bytes(pdf_bytes)
                pdf_generated = True
            except Exception as e:
                logger.warning("WeasyPrint PDF generation failed: %s — falling back to HTML", e)

        if not pdf_generated:
            # Fallback to self-contained HTML
            fmt = "html"
            html_bytes = html_content.encode("utf-8")
            filename = f"report_{report_id}.html"
            file_path = os.path.join(output_dir, filename)
            with open(file_path, "wb") as f:
                f.write(html_bytes)
            file_hash = _sha256_of_bytes(html_bytes)

    elif fmt == "docx":
        if not _check_docx():
            raise RuntimeError("python-docx is not installed. Run: pip install python-docx")
        docx_bytes = _build_report_docx(scan, findings)
        filename = f"report_{report_id}.docx"
        file_path = os.path.join(output_dir, filename)
        with open(file_path, "wb") as f:
            f.write(docx_bytes)
        file_hash = _sha256_of_bytes(docx_bytes)

    else:
        raise ValueError(f"Unsupported format: {fmt}. Use 'pdf' or 'docx'.")

    return {
        "report_id": report_id,
        "file_path": file_path,
        "file_hash_sha256": file_hash,
        "format": fmt,
        "generated_at": datetime.utcnow(),
    }
