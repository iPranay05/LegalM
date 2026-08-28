from app.services.groq_service import _parse_json


def test_parse_json_recovers_json_after_unclosed_reasoning_block():
    response = """<think>
I inspected the label and identified the short LOT and MRP declarations.
Here is the structured result:
{"product_name": {"value": "Lens Cleaning Solution", "confidence": 0.91, "bbox": [0.1, 0.1, 0.8, 0.2]}, "batch_number": {"value": "906199", "confidence": 0.82, "bbox": [0.2, 0.5, 0.5, 0.55]}}
"""
    parsed = _parse_json(response)
    assert parsed["product_name"]["value"] == "Lens Cleaning Solution"
    assert parsed["batch_number"]["value"] == "906199"
