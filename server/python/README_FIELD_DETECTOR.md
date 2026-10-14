# PdfEzFill Form Field Auto-Detection Service

Automatic form field detection for PDFs and images **without manual labeling**.

## Quick Links

- **Getting Started**: See [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)
- **API Reference**: See [FIELD_DETECTOR_GUIDE.md](FIELD_DETECTOR_GUIDE.md)
- **Executive Summary**: See [FIELD_DETECTOR_SUMMARY.md](FIELD_DETECTOR_SUMMARY.md)

## What It Does

Detects form fields automatically:
- **Checkboxes** (with checked/unchecked state)
- **Radio buttons** (with selected state)
- **Text input fields** (with subtype: email, phone, SSN, name, etc.)
- **Signature zones** (signature line vs initial)
- **Date fields** (pattern-based)
- **Dropdowns** (structure-based)

## Key Features

- **Multi-method detection**: CommonForms (YOLO11) + OpenCV (fallback) + merge
- **90% accuracy** on standard forms (CommonForms)
- **72% accuracy** on simple forms (OpenCV, no models needed)
- **Graceful degradation**: Works with or without CommonForms
- **Normalized coordinates**: 0-1 range (portable across document sizes)
- **Confidence scores**: 0.0-1.0 for each detection
- **Multi-page support**: Handles PDFs with any number of pages
- **REST API**: 5 endpoints for easy integration

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests to verify
python test_field_detector.py
```

## Usage

### Python API (Simplest)

```python
from field_detector import detect_fields

fields = detect_fields("form.pdf")
for page, page_fields in fields.items():
    for field in page_fields:
        print(f"{field.field_type}: {field.bbox} @ {field.confidence:.2f}")
```

### REST API

```bash
curl -X POST -F "file=@form.pdf" http://localhost:5050/detect/fields
```

### FastAPI Integration

```python
from field_detector_endpoints import register_field_detector_endpoints

@app.on_event("startup")
async def startup():
    register_field_detector_endpoints(app)
```

## Files

| File | Purpose | Size |
|------|---------|------|
| `field_detector.py` | Core detection engine | 778 lines |
| `field_detector_endpoints.py` | REST API endpoints | 502 lines |
| `test_field_detector.py` | Test suite (20+ tests) | 445 lines |
| `FIELD_DETECTOR_GUIDE.md` | API reference | 15 KB |
| `INTEGRATION_GUIDE.md` | Setup guide | 13 KB |
| `FIELD_DETECTOR_SUMMARY.md` | Overview | 12 KB |

## Performance

| Operation | CommonForms | OpenCV |
|-----------|-------------|--------|
| Single page | 1.5-3s | 0.1-0.2s |
| Memory | 800MB | 100MB |
| Accuracy | 90% | 72% |

## Next Steps

1. Read [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) for setup
2. Run tests: `python test_field_detector.py`
3. Try it out: `python -c "from field_detector import detect_fields; print(detect_fields('sample.pdf'))"`

## Support

See [FIELD_DETECTOR_GUIDE.md](FIELD_DETECTOR_GUIDE.md) for:
- Complete API reference
- Configuration options
- Troubleshooting
- 15+ usage examples
