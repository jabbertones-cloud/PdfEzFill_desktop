# Form Field Auto-Detection Service Guide

## Overview

The **FieldDetector** is an automatic form field detection service for PdfEzFill that identifies checkboxes, signature zones, text input boxes, and other form fields **without manual labeling**.

The service uses a multi-method approach:
- **Primary**: CommonForms/FFDNet (YOLO11-based, highest accuracy)
- **Fallback**: OpenCV heuristic detection (pure computer vision, no ML models)
- **Merge**: Intelligent combination of results when both methods detect the same field

All coordinates are returned **normalized (0-1 range)** relative to page size for consistency across different document dimensions.

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Core field detection
pip install commonforms>=1.0.0
pip install pdf2image>=1.16.0

# Optional: For enhanced checkbox detection with YOLOv8
pip install ultralytics>=8.0.0
```

## Quick Start

### Python API

```python
from field_detector import FieldDetector

# Create detector instance
detector = FieldDetector()

# Detect all fields in a document
fields_by_page = detector.detect_all("form.pdf")

# Results organized by page
for page_num, fields in fields_by_page.items():
    print(f"Page {page_num}: {len(fields)} fields detected")

    for field in fields:
        print(f"  - Type: {field.field_type}")
        print(f"    BBox: {field.bbox}")  # [x, y, width, height] (0-1 normalized)
        print(f"    Confidence: {field.confidence}")
        print(f"    State: {field.state}")  # "checked"/"unchecked" for checkboxes
        print(f"    Label: {field.label}")
        print(f"    Subtype: {field.subtype}")  # "email", "phone", etc.
```

### Convenience Functions

```python
from field_detector import (
    detect_fields,
    detect_checkboxes_only,
    detect_signatures_only,
    fields_to_dict
)

# Detect all fields
all_fields = detect_fields("form.pdf")

# Detect specific types
checkboxes = detect_checkboxes_only("form.pdf")
signatures = detect_signatures_only("form.pdf")

# Convert to JSON-serializable format
json_fields = fields_to_dict(all_fields[0])  # Page 0
```

### FastAPI Endpoints

Start the standalone field detector service:

```bash
python field_detector_endpoints.py
# Service runs on http://localhost:5051
```

Or integrate into existing `ocr_service.py`:

```python
# In ocr_service.py startup
from field_detector_endpoints import register_field_detector_endpoints

@app.on_event("startup")
async def startup_event():
    # ... existing init code ...
    register_field_detector_endpoints(app)
    # Endpoints now available at /detect/*
```

## API Endpoints

### POST `/detect/fields`
Detect all form fields in uploaded document.

**Request:**
```bash
curl -X POST -F "file=@form.pdf" http://localhost:5050/detect/fields
```

**Response:**
```json
{
  "success": true,
  "fields_by_page": {
    "0": [
      {
        "field_type": "checkbox",
        "bbox": [0.1, 0.2, 0.05, 0.05],
        "confidence": 0.85,
        "page": 0,
        "state": "unchecked",
        "label": "I agree",
        "subtype": null,
        "source": "commonforms"
      },
      {
        "field_type": "text_input",
        "bbox": [0.1, 0.3, 0.3, 0.03],
        "confidence": 0.72,
        "page": 0,
        "state": null,
        "label": "Name",
        "subtype": "name",
        "source": "opencv"
      }
    ],
    "1": [...]
  },
  "total_fields": 42,
  "pages": 2,
  "file": "form.pdf"
}
```

### POST `/detect/checkboxes`
Detect only checkboxes with state (checked/unchecked).

```bash
curl -X POST -F "file=@form.pdf" http://localhost:5050/detect/checkboxes
```

### POST `/detect/signatures`
Detect signature zones and initial lines.

```bash
curl -X POST -F "file=@form.pdf" http://localhost:5050/detect/signatures
```

### POST `/detect/text-inputs`
Detect text input fields with subtype classification.

```bash
curl -X POST -F "file=@form.pdf" http://localhost:5050/detect/text-inputs
```

### GET `/detect/capabilities`
Get available detection methods and features.

```bash
curl http://localhost:5050/detect/capabilities
```

## Field Types

### Detected Field Types

| Type | Description | State | Subtypes |
|------|-------------|-------|----------|
| `checkbox` | Checkbox (square) | checked/unchecked | - |
| `radio` | Radio button (circle) | checked/unchecked | - |
| `text_input` | Text input field | - | text, email, phone, ssn, address, name, zip |
| `signature` | Signature zone | - | signature_line, initial_line |
| `date` | Date field | - | - |
| `initial` | Initials field | - | - |
| `dropdown` | Dropdown/select | - | - |

### DetectedField Dataclass

```python
@dataclass
class DetectedField:
    field_type: str              # "checkbox", "text_input", "signature", etc.
    bbox: List[float]            # [x, y, width, height] normalized 0-1
    confidence: float            # 0.0-1.0 (detection confidence)
    page: int                    # Page number (0-indexed)
    state: Optional[str]         # "checked"/"unchecked" for checkboxes/radios
    label: Optional[str]         # Nearby text label (if detected)
    subtype: Optional[str]       # e.g., "email", "phone", "ssn" for text inputs
    source: str                  # "commonforms", "opencv", or "merged"
```

## Detection Pipeline

### 1. CommonForms/FFDNet (Primary)

**Advantages:**
- YOLO11-based trained model
- Most accurate for standard forms
- Detects field types automatically
- Confidence scores included

**Requirements:**
- `pip install commonforms`

**Limitations:**
- Requires pre-trained model download
- Slower than OpenCV (~1-3 seconds per page)
- May fail on non-standard forms

**Fallback:** If CommonForms is not installed or fails, the system automatically falls back to OpenCV.

### 2. OpenCV Heuristic Detection (Fallback)

**Advantages:**
- Pure computer vision, no ML models required
- Fast processing (~100ms per page)
- Works on any form
- No model downloads needed

**How it works:**

#### Checkboxes
- Find small square contours (area 200-5000 px²)
- Check aspect ratio ~1.0 (square shape)
- Analyze fill percentage to detect "checked" vs "unchecked"
- Threshold: mean pixel value < 150 = filled

#### Text Input Fields
- Detect horizontal lines via Hough Line Transform
- Group nearby horizontal lines
- Create bounding boxes for input areas
- Minimum width: 50px

#### Signature Zones
- Look for horizontal lines in bottom 100px of page
- Find longest line (likely signature line)
- Create bounding box for signature area

#### Radio Buttons
- Use Hough Circle detection
- Find small circles (radius 5-20px)
- Check fill percentage for "checked" state

#### Date Fields
- Look for underscore patterns: `__/__/____`
- Check proximity to "Date" text

### 3. Merge Logic

When both CommonForms and OpenCV detect the same region:

1. **Calculate IoU** (Intersection over Union)
2. **If IoU > 0.5**: Merge detections
   - Prefer CommonForms confidence
   - Boost confidence if both methods agree
   - Merge labels if available
3. **If IoU < 0.5**: Keep separate detections
4. **Final result**: OpenCV detections not found by CommonForms are included

### 4. Subtype Classification

For text input fields, classify based on nearby label text:

```
"Email" / "E-mail" / "Mail" → email
"Phone" / "Tel" / "Telephone" → phone
"SSN" / "Social Security" → ssn
"Address" / "Street" / "City" → address (or zip)
"Name" / "First" / "Last" → name
```

For signature fields:
```
"Initial" in label → initial_line
Otherwise → signature_line
```

## Coordinate System

All bounding boxes are **normalized to 0-1 range** relative to page size:

```
bbox = [x, y, width, height]

Where:
- x: Horizontal position (0.0 = left edge, 1.0 = right edge)
- y: Vertical position (0.0 = top edge, 1.0 = bottom edge)
- width: Field width relative to page width
- height: Field height relative to page height
```

**Example:**
```
bbox = [0.1, 0.2, 0.05, 0.05]

Means:
- 10% from left edge
- 20% from top edge
- 5% of page width
- 5% of page height
```

**To convert to pixel coordinates:**
```python
def bbox_to_pixels(bbox, page_width, page_height):
    x, y, w, h = bbox
    return [
        x * page_width,
        y * page_height,
        w * page_width,
        h * page_height
    ]
```

## Configuration

### Detection Parameters

In `field_detector.py`:

```python
# Checkbox detection
CHECKBOX_MIN_AREA = 200  # pixels²
CHECKBOX_MAX_AREA = 5000  # pixels²
CHECKBOX_ASPECT_RATIO_MIN = 0.7
CHECKBOX_ASPECT_RATIO_MAX = 1.3
CHECKBOX_FILL_THRESHOLD = 150  # mean pixel < this = filled

# Signature detection
SIGNATURE_LINE_MIN_LENGTH = 100  # pixels
SIGNATURE_ZONE_HEIGHT = 100  # pixels from bottom

# Text input detection
TEXT_INPUT_MIN_WIDTH = 50  # pixels
TEXT_INPUT_MIN_HEIGHT = 15  # pixels

# Merge threshold
FIELD_MERGE_IOU_THRESHOLD = 0.5  # IoU to consider same field

# Label proximity
LABEL_PROXIMITY_THRESHOLD = 50  # pixels
```

### Environment Variables

```bash
# For CommonForms (if using custom path)
COMMONFORMS_MODEL_PATH=/path/to/model

# For Ollama VLM (future enhancement)
OLLAMA_URL=http://localhost:11434
OLLAMA_CLASSIFY_MODEL=llama3.1:8b
```

## Examples

### Example 1: Extract All Checkboxes with States

```python
from field_detector import FieldDetector

detector = FieldDetector()
fields = detector.detect_all("insurance_form.pdf")

for page, page_fields in fields.items():
    checkboxes = [f for f in page_fields if f.field_type == "checkbox"]

    for checkbox in checkboxes:
        print(f"Page {page}: {checkbox.label} = {checkbox.state}")
        # Output: Page 0: I agree = unchecked
```

### Example 2: Find Email Input Fields

```python
from field_detector import FieldDetector, FieldType, FieldSubtype

detector = FieldDetector()
fields = detector.detect_all("application_form.pdf")

for page, page_fields in fields.items():
    for field in page_fields:
        if field.field_type == "text_input" and field.subtype == "email":
            print(f"Email field at page {page}: {field.label}")
            print(f"  Bounding box: {field.bbox}")
            print(f"  Confidence: {field.confidence}")
```

### Example 3: Multi-Page Processing with JSON Output

```python
from field_detector import detect_fields, fields_to_dict
import json

# Detect all fields
fields_by_page = detect_fields("multi_page_form.pdf")

# Convert to JSON
result = {
    "total_pages": len(fields_by_page),
    "total_fields": sum(len(f) for f in fields_by_page.values()),
    "pages": {}
}

for page, fields in fields_by_page.items():
    result["pages"][page] = fields_to_dict(fields)

# Save to JSON
with open("detected_fields.json", "w") as f:
    json.dump(result, f, indent=2)
```

### Example 4: OpenCV-Only Detection (No ML Models)

```python
from field_detector import FieldDetector
import cv2

detector = FieldDetector()

# Load image
image = cv2.imread("form_page.png")

# Run OpenCV detection (pure computer vision, no models)
fields = detector.detect_with_opencv(image, page=0)

print(f"Detected {len(fields)} fields using OpenCV only")
for field in fields:
    print(f"  - {field.field_type}: confidence={field.confidence}")
```

## Performance

### Benchmarks (on M3 Max MacBook Pro)

| Operation | CommonForms | OpenCV |
|-----------|------------|--------|
| Single page | 1.5-3s | 0.1-0.2s |
| 10-page PDF | 15-30s | 1-2s |
| Memory usage | ~800MB | ~100MB |

**Recommendation:**
- Use CommonForms for maximum accuracy (slightly slower)
- Use OpenCV fallback for speed (when CommonForms unavailable)
- Hybrid approach: CommonForms primary + OpenCV merge for best results

## Troubleshooting

### Issue: CommonForms not detected

**Solution:**
```bash
pip install commonforms
```

Verify installation:
```python
from field_detector import FieldDetector
detector = FieldDetector()
print(detector.commonforms_available)  # Should be True
```

### Issue: PDF conversion fails

**Solution:**
Ensure `poppler-utils` is installed:
```bash
# macOS
brew install poppler

# Linux
sudo apt-get install poppler-utils

# Or install Python fallback
pip install pdf2image
```

### Issue: Checkboxes not detected

**Debug:**
1. Check if checkbox size matches parameters (200-5000 px²)
2. Verify aspect ratio is square-like (0.7-1.3)
3. Increase/decrease `CHECKBOX_FILL_THRESHOLD` if fill detection is wrong
4. Run with CommonForms for comparison

### Issue: Text input fields missed

**Debug:**
1. Verify horizontal lines are properly detected (Hough Line parameters)
2. Check minimum width requirement (TEXT_INPUT_MIN_WIDTH = 50px)
3. Increase Canny edge detection thresholds if lines too faint

### Issue: Low confidence scores

**Possible causes:**
- Document is poorly scanned (low contrast, blurry)
- Uncommon form layout
- Fields partially filled

**Solution:**
- Preprocess document (see `ocr_service.py` for preprocessing options)
- Use CommonForms instead of OpenCV
- Combine with VLM analysis for ambiguous fields

## Advanced Usage

### Custom Detection on Image Array

```python
import cv2
from field_detector import FieldDetector

# Load image
image = cv2.imread("form.png")

# Create detector
detector = FieldDetector()

# Run OpenCV detection directly
fields = detector.detect_with_opencv(image, page=0)

# Or run preprocessing first
preprocessed = detector._detect_opencv_with_preprocessing(image, page=0)
```

### Integration with OCR Service

See `ocr_service.py` for integration pattern:

```python
# In ocr_service.py
from field_detector_endpoints import register_field_detector_endpoints

@app.on_event("startup")
async def startup_event():
    await ocr_service_instance.initialize()
    register_field_detector_endpoints(app)

# Now both /ocr/* and /detect/* endpoints available
```

### Batching Multiple Documents

```python
from field_detector import FieldDetector
from pathlib import Path

detector = FieldDetector()

# Detect fields in all PDFs in directory
pdf_dir = Path("forms")
for pdf_path in pdf_dir.glob("*.pdf"):
    print(f"Processing {pdf_path}")

    try:
        fields = detector.detect_all(str(pdf_path))
        print(f"  → {sum(len(f) for f in fields.values())} fields detected")
    except Exception as e:
        print(f"  → ERROR: {e}")
```

## Future Enhancements

1. **Checkbox-Detection (YOLOv8)** - More specialized checkbox detection
2. **LayoutLMv3** - Transformer-based field detection for complex layouts
3. **Label Association** - Better proximity-based label linking
4. **Handwriting Detection** - Detect if field is handwritten vs empty
5. **Table Detection** - Support for fields within tables
6. **OCR Integration** - Link detected fields with OCR text extraction
7. **VLM Augmentation** - Use local VLM for ambiguous field classification

## References

- **CommonForms/FFDNet**: https://github.com/CommonForms/FFDNet
- **OpenCV**: https://docs.opencv.org/
- **LayoutLMv3**: https://huggingface.co/microsoft/layoutlmv3-base
- **YOLOv8**: https://github.com/ultralytics/ultralytics

## License

Part of PdfEzFill project.
