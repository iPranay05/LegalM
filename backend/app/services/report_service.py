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


def _build_report_html(scan, findings: list) -> str:
    """Build the HTML string used for PDF rendering."""
    field_rows = ""
    if scan.field_results:
        for key, present in scan.field_results.items():
            label = key.replace("_", " ").title()
            status = "✓ Present" if present else "✗ Missing"
            color = "#1a7a3c" if present else "#c0392b"
            extracted = (scan.extracted_fields or {}).get(key, "—")
            field_rows += f"""
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">{label}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;">{extracted}</td>
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

    compliance_color = "#1a7a3c" if scan.is_compliant else "#c0392b"
    compliance_label = "COMPLIANT" if scan.is_compliant else "NON-COMPLIANT"

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
    <thead><tr><th>Field</th><th>Extracted Value</th><th>Status</th></tr></thead>
    <tbody>{field_rows}</tbody>
  </table>

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
    """Build DOCX report as bytes."""
    from docx import Document
    from docx.shared import RGBColor
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
    run = p.add_run("COMPLIANT" if scan.is_compliant else "NON-COMPLIANT")
    run.bold = True
    run.font.color.rgb = RGBColor(0x1a, 0x7a, 0x3c) if scan.is_compliant else RGBColor(0xc0, 0x39, 0x2b)
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
    if scan.field_results:
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
            r[2].text = "✓ Present" if present else "✗ Missing"

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
        if _check_weasyprint():
            from weasyprint import HTML as WeasyHTML
            pdf_bytes = WeasyHTML(string=html_content).write_pdf()
            filename = f"report_{report_id}.pdf"
            file_path = os.path.join(output_dir, filename)
            with open(file_path, "wb") as f:
                f.write(pdf_bytes)
            file_hash = _sha256_of_bytes(pdf_bytes)
        else:
            # GTK not available on this machine — save as self-contained HTML
            # which browsers can print-to-PDF locally.
            logger.warning("WeasyPrint unavailable — saving report as HTML instead of PDF.")
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
