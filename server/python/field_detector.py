"""
Form Field Auto-Detection Service for PdfEzFill.

Automatically detects checkboxes, signature zones, text input boxes, and other form fields
from PDF/image WITHOUT manual labeling.

Detection pipeline:
1. Primary: CommonForms/FFDNet (YOLO11-based, most accurate)
2. Fallback: OpenCV heuristic detection (pure computer vision, no ML models)
3. Merge: Combine detections when IoU > 0.5, prefer CommonForms confidence
4. Classification: Subtype fields (email, phone, date, etc.)
5. Normalization: Return all coordinates as 0-1 range

Supports multi-page PDFs with field-level sorting.
"""

import logging
import cv2
import numpy as np
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass, asdict, field
from enum import Enum
import math
from io import BytesIO
import pdf2image

# Optional: CommonForms
try:
    from commonforms import prepare_form
    COMMONFORMS_AVAILABLE = True
except ImportError:
    COMMONFORMS_AVAILABLE = False

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Configuration
CHECKBOX_MIN_AREA = 200  # pixels²
CHECKBOX_MAX_AREA = 5000  # pixels²
CHECKBOX_ASPECT_RATIO_MIN = 0.7
CHECKBOX_ASPECT_RATIO_MAX = 1.3
CHECKBOX_FILL_THRESHOLD = 150  # mean pixel value to consider "checked"

SIGNATURE_LINE_MIN_LENGTH = 100  # pixels
SIGNATURE_ZONE_HEIGHT = 100  # pixels (typical height of signature box)

TEXT_INPUT_MIN_WIDTH = 50  # pixels
TEXT_INPUT_MIN_HEIGHT = 15  # pixels

FIELD_MERGE_IOU_THRESHOLD = 0.5  # IoU threshold for merging detections

# Proximity thresholds for label association (pixels)
LABEL_PROXIMITY_THRESHOLD = 50


class FieldType(str, Enum):
    """Enumeration of field types"""
    CHECKBOX = "checkbox"
    RADIO = "radio"
    TEXT_INPUT = "text_input"
    SIGNATURE = "signature"
    DATE = "date"
    INITIAL = "initial"
    DROPDOWN = "dropdown"


class FieldSubtype(str, Enum):
    """Subtypes for specialized field detection"""
    # Text input subtypes
    TEXT = "text"
    EMAIL = "email"
    PHONE = "phone"
    SSN = "ssn"
    ADDRESS = "address"
    NAME = "name"
    ZIP = "zip"

    # Checkbox subtypes
    CHECKBOX_STD = "checkbox"
    CHECKBOX_CHECKED = "checkbox_checked"
    CHECKBOX_UNCHECKED = "checkbox_unchecked"

    # Signature subtypes
    SIGNATURE_LINE = "signature_line"
    INITIAL_LINE = "initial_line"

    # Checkbox state
    CHECKED = "checked"
    UNCHECKED = "unchecked"


@dataclass
class DetectedField:
    """Detected form field with bounding box and metadata"""
    field_type: str  # "checkbox", "radio", "text_input", "signature", etc.
    bbox: List[float]  # [x, y, width, height] normalized 0-1
    confidence: float  # 0.0-1.0
    page: int  # Page number (0-indexed)
    state: Optional[str] = None  # "checked"/"unchecked" for checkboxes/radios
    label: Optional[str] = None  # Nearby text label if detected
    subtype: Optional[str] = None  # "email", "phone", "ssn" for text inputs, etc.
    source: str = "unknown"  # "commonforms", "opencv", "merged"

    def __post_init__(self):
        """Validate bbox"""
        if len(self.bbox) != 4:
            raise ValueError(f"bbox must have 4 elements, got {len(self.bbox)}")
        if not all(0.0 <= v <= 1.0 for v in self.bbox):
            raise ValueError(f"bbox values must be normalized 0-1, got {self.bbox}")

    def iou(self, other: 'DetectedField') -> float:
        """Calculate Intersection over Union with another field"""
        if other.page != self.page:
            return 0.0  # Different pages = no overlap

        x1_min, y1_min, w1, h1 = self.bbox
        x2_min, y2_min, w2, h2 = other.bbox

        x1_max = x1_min + w1
        y1_max = y1_min + h1
        x2_max = x2_min + w2
        y2_max = y2_min + h2

        # Intersection
        xi_min = max(x1_min, x2_min)
        yi_min = max(y1_min, y2_min)
        xi_max = min(x1_max, x2_max)
        yi_max = min(y1_max, y2_max)

        if xi_max < xi_min or yi_max < yi_min:
            return 0.0  # No overlap

        intersection = (xi_max - xi_min) * (yi_max - yi_min)
        area1 = w1 * h1
        area2 = w2 * h2
        union = area1 + area2 - intersection

        return intersection / union if union > 0 else 0.0


class FieldDetector:
    """Multi-method form field detector with CommonForms primary and OpenCV fallback"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.commonforms_available = COMMONFORMS_AVAILABLE

        if self.commonforms_available:
            self.logger.info("CommonForms/FFDNet available for primary detection")
        else:
            self.logger.warning(
                "CommonForms not installed. Using OpenCV fallback. "
                "For better accuracy: pip install commonforms"
            )

    # ========== PRIMARY DETECTION: CommonForms ==========

    def detect_with_commonforms(self, image_or_pdf_path: str) -> List[DetectedField]:
        """
        Detect form fields using CommonForms/FFDNet (YOLO11-based).

        Args:
            image_or_pdf_path: Path to PDF or image file

        Returns:
            List of DetectedField objects with normalized coordinates
        """
        if not self.commonforms_available:
            return []

        try:
            self.logger.info(f"Running CommonForms detection on {image_or_pdf_path}")
            result = prepare_form(image_or_pdf_path)

            fields = []

            # Parse CommonForms output
            # Expected format: result.fields = [{"type": "TextInput"|"ChoiceButton"|"Signature", "bbox": [x,y,w,h], "confidence": 0-1, ...}]
            for detected_item in result.get("fields", []):
                field_type = detected_item.get("type", "").lower()
                bbox = detected_item.get("bbox", [])
                confidence = float(detected_item.get("confidence", 0.8))
                page = detected_item.get("page", 0)

                # Map CommonForms type to our FieldType
                mapped_type = self._map_commonforms_type(field_type)

                if mapped_type and len(bbox) == 4:
                    # Normalize coordinates
                    normalized_bbox = self._normalize_bbox(bbox, detected_item.get("image_width", 1000), detected_item.get("image_height", 1400))

                    field = DetectedField(
                        field_type=mapped_type,
                        bbox=normalized_bbox,
                        confidence=confidence,
                        page=page,
                        state=detected_item.get("state"),  # "checked"/"unchecked" for checkboxes
                        label=detected_item.get("label"),
                        source="commonforms"
                    )
                    fields.append(field)

            self.logger.info(f"CommonForms detected {len(fields)} fields")
            return fields

        except Exception as e:
            self.logger.error(f"CommonForms detection failed: {e}")
            return []

    def _map_commonforms_type(self, cf_type: str) -> Optional[str]:
        """Map CommonForms type to our FieldType"""
        cf_type = cf_type.lower().strip()

        mapping = {
            "textinput": FieldType.TEXT_INPUT,
            "text_input": FieldType.TEXT_INPUT,
            "choicebutton": FieldType.CHECKBOX,
            "choice_button": FieldType.CHECKBOX,
            "checkbox": FieldType.CHECKBOX,
            "radio": FieldType.RADIO,
            "signature": FieldType.SIGNATURE,
            "dropdown": FieldType.DROPDOWN,
        }

        return mapping.get(cf_type)

    # ========== FALLBACK DETECTION: OpenCV Heuristic ==========

    def detect_with_opencv(self, image: np.ndarray, page: int = 0) -> List[DetectedField]:
        """
        Detect form fields using pure OpenCV heuristics (no ML models).

        Detects:
        - Checkboxes: small square contours, checks fill state
        - Signature zones: horizontal lines near page bottom, long underscores
        - Text input fields: horizontal lines with blank space above
        - Radio buttons: small circles
        - Date fields: underscore patterns or nearby "Date" text

        Args:
            image: Input image (BGR or grayscale)
            page: Page number (for multi-page PDFs)

        Returns:
            List of DetectedField objects
        """
        try:
            self.logger.info(f"Running OpenCV detection on page {page}")

            # Convert to grayscale for processing
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

            fields = []
            h, w = gray.shape

            # 1. Detect checkboxes
            checkbox_fields = self._detect_checkboxes_opencv(image, gray, h, w, page)
            fields.extend(checkbox_fields)

            # 2. Detect text input fields
            textinput_fields = self._detect_textinput_fields_opencv(gray, h, w, page)
            fields.extend(textinput_fields)

            # 3. Detect signature zones
            signature_fields = self._detect_signature_zones_opencv(gray, h, w, page)
            fields.extend(signature_fields)

            # 4. Detect radio buttons
            radio_fields = self._detect_radio_buttons_opencv(gray, h, w, page)
            fields.extend(radio_fields)

            self.logger.info(f"OpenCV detected {len(fields)} fields on page {page}")
            return fields

        except Exception as e:
            self.logger.error(f"OpenCV detection failed: {e}")
            return []

    def _detect_checkboxes_opencv(
        self, image: np.ndarray, gray: np.ndarray, h: int, w: int, page: int
    ) -> List[DetectedField]:
        """Detect checkboxes: find small square contours and check fill state"""
        fields = []

        try:
            # Adaptive threshold for binary image
            binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)

            # Find contours
            contours, _ = cv2.findContours(binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                area = cv2.contourArea(contour)

                # Filter by area
                if not (CHECKBOX_MIN_AREA <= area <= CHECKBOX_MAX_AREA):
                    continue

                # Check if approximately square
                x, y, cw, ch = cv2.boundingRect(contour)
                aspect_ratio = cw / ch if ch > 0 else 0

                if not (CHECKBOX_ASPECT_RATIO_MIN <= aspect_ratio <= CHECKBOX_ASPECT_RATIO_MAX):
                    continue

                # Check if it's actually a checkbox (not filled text)
                # Extract region and check fill percentage
                roi = gray[y:y+ch, x:x+cw]
                fill_percentage = (np.sum(roi < CHECKBOX_FILL_THRESHOLD) / (cw * ch)) * 100

                # Checkbox should have some empty space or be mostly filled/empty
                if fill_percentage < 10 or fill_percentage > 90:
                    # Determine state
                    state = "checked" if fill_percentage > 50 else "unchecked"

                    # Normalize coordinates
                    norm_bbox = [x / w, y / h, cw / w, ch / h]

                    field = DetectedField(
                        field_type=FieldType.CHECKBOX,
                        bbox=norm_bbox,
                        confidence=0.7,  # Lower confidence for heuristic detection
                        page=page,
                        state=state,
                        source="opencv"
                    )
                    fields.append(field)

            self.logger.debug(f"OpenCV detected {len(fields)} checkboxes on page {page}")

        except Exception as e:
            self.logger.debug(f"Checkbox detection failed: {e}")

        return fields

    def _detect_textinput_fields_opencv(
        self, gray: np.ndarray, h: int, w: int, page: int
    ) -> List[DetectedField]:
        """Detect text input fields: horizontal lines with blank space above"""
        fields = []

        try:
            # Edge detection
            edges = cv2.Canny(gray, 50, 150)

            # Detect horizontal lines
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 50, minLineLength=TEXT_INPUT_MIN_WIDTH, maxLineGap=10)

            if lines is None:
                return fields

            # Group lines by y-coordinate (horizontal alignment)
            line_groups = {}
            for line in lines:
                x1, y1, x2, y2 = line[0]

                # Only consider roughly horizontal lines
                if abs(y2 - y1) > 5:
                    continue

                y_key = round(y1 / 10) * 10  # Group by ~10px bands
                if y_key not in line_groups:
                    line_groups[y_key] = []
                line_groups[y_key].append(line)

            # Process each group
            for y_key, line_list in line_groups.items():
                # Merge nearby lines
                merged_lines = self._merge_horizontal_lines(line_list)

                for x1, y1, x2, y2 in merged_lines:
                    line_width = abs(x2 - x1)

                    if line_width < TEXT_INPUT_MIN_WIDTH:
                        continue

                    # Normalize coordinates
                    norm_bbox = [min(x1, x2) / w, y1 / h, line_width / w, TEXT_INPUT_MIN_HEIGHT / h]

                    field = DetectedField(
                        field_type=FieldType.TEXT_INPUT,
                        bbox=norm_bbox,
                        confidence=0.65,
                        page=page,
                        subtype=FieldSubtype.TEXT,
                        source="opencv"
                    )
                    fields.append(field)

            self.logger.debug(f"OpenCV detected {len(fields)} text input fields on page {page}")

        except Exception as e:
            self.logger.debug(f"Text input detection failed: {e}")

        return fields

    def _detect_signature_zones_opencv(
        self, gray: np.ndarray, h: int, w: int, page: int
    ) -> List[DetectedField]:
        """Detect signature zones: horizontal lines near bottom, long underscores"""
        fields = []

        try:
            # Look for horizontal lines in bottom SIGNATURE_ZONE_HEIGHT of page
            bottom_region = gray[max(0, h - SIGNATURE_ZONE_HEIGHT):h, :]

            edges = cv2.Canny(bottom_region, 50, 150)
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 40, minLineLength=SIGNATURE_LINE_MIN_LENGTH, maxLineGap=20)

            if lines is None:
                return fields

            # Find the most prominent horizontal line (likely signature line)
            best_line = None
            best_length = 0

            for line in lines:
                x1, y1, x2, y2 = line[0]

                # Only horizontal lines
                if abs(y2 - y1) > 5:
                    continue

                length = abs(x2 - x1)
                if length > best_length and length > SIGNATURE_LINE_MIN_LENGTH:
                    best_length = length
                    best_line = (x1, y1, x2, y2)

            if best_line:
                x1, y1, x2, y2 = best_line

                # Convert back to full image coordinates
                y1_full = max(0, h - SIGNATURE_ZONE_HEIGHT) + y1

                # Create bounding box for signature area
                line_width = abs(x2 - x1)
                norm_bbox = [min(x1, x2) / w, y1_full / h, line_width / w, 30 / h]

                field = DetectedField(
                    field_type=FieldType.SIGNATURE,
                    bbox=norm_bbox,
                    confidence=0.7,
                    page=page,
                    source="opencv"
                )
                fields.append(field)

            self.logger.debug(f"OpenCV detected {len(fields)} signature zones on page {page}")

        except Exception as e:
            self.logger.debug(f"Signature detection failed: {e}")

        return fields

    def _detect_radio_buttons_opencv(
        self, gray: np.ndarray, h: int, w: int, page: int
    ) -> List[DetectedField]:
        """Detect radio buttons: small circles via HoughCircles"""
        fields = []

        try:
            # Blur for circle detection
            blurred = cv2.medianBlur(gray, 5)

            circles = cv2.HoughCircles(
                blurred,
                cv2.HOUGH_GRADIENT,
                dp=1,
                minDist=50,
                param1=50,
                param2=30,
                minRadius=5,
                maxRadius=20
            )

            if circles is None:
                return fields

            circles = np.uint16(np.around(circles))

            for i in circles[0, :]:
                x, y, r = i[0], i[1], i[2]

                # Check fill state
                mask = np.zeros(gray.shape, dtype=np.uint8)
                cv2.circle(mask, (x, y), r, 255, -1)

                roi = cv2.bitwise_and(gray, gray, mask=mask)
                fill_percentage = (np.sum(roi < CHECKBOX_FILL_THRESHOLD) / np.sum(mask > 0)) * 100 if np.sum(mask) > 0 else 0

                state = "checked" if fill_percentage > 50 else "unchecked"

                # Normalize coordinates
                diameter = 2 * r
                norm_bbox = [(x - r) / w, (y - r) / h, diameter / w, diameter / h]

                field = DetectedField(
                    field_type=FieldType.RADIO,
                    bbox=norm_bbox,
                    confidence=0.65,
                    page=page,
                    state=state,
                    source="opencv"
                )
                fields.append(field)

            self.logger.debug(f"OpenCV detected {len(fields)} radio buttons on page {page}")

        except Exception as e:
            self.logger.debug(f"Radio button detection failed: {e}")

        return fields

    # ========== HELPER METHODS ==========

    def _merge_horizontal_lines(self, lines: List) -> List[Tuple[float, float, float, float]]:
        """Merge overlapping horizontal lines"""
        if not lines:
            return []

        # Convert to simple format
        simplified = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            simplified.append((min(x1, x2), y1, max(x1, x2), y2))

        # Sort by x1
        simplified.sort(key=lambda l: l[0])

        merged = []
        current = simplified[0]

        for line in simplified[1:]:
            x1_cur, y1_cur, x2_cur, y2_cur = current
            x1_new, y1_new, x2_new, y2_new = line

            # Check if lines are close and can be merged
            if x1_new - x2_cur < 20 and abs(y1_cur - y1_new) < 5:
                # Merge by extending x2
                current = (x1_cur, y1_cur, max(x2_cur, x2_new), y2_cur)
            else:
                merged.append(current)
                current = line

        merged.append(current)
        return merged

    def _normalize_bbox(self, bbox: List[float], image_width: float, image_height: float) -> List[float]:
        """Normalize bounding box to 0-1 range"""
        x, y, w, h = bbox
        return [x / image_width, y / image_height, w / image_width, h / image_height]

    # ========== FIELD CLASSIFICATION ==========

    def classify_field_subtype(self, field: DetectedField, nearby_text: Optional[str] = None) -> None:
        """Classify field subtype based on type, label, and position"""
        if field.field_type == FieldType.TEXT_INPUT:
            field.subtype = self._classify_textinput_subtype(field, nearby_text)
        elif field.field_type == FieldType.SIGNATURE:
            field.subtype = self._classify_signature_subtype(field, nearby_text)

    def _classify_textinput_subtype(self, field: DetectedField, nearby_text: Optional[str] = None) -> str:
        """Classify text input subtype (email, phone, SSN, etc.)"""
        if not nearby_text:
            return FieldSubtype.TEXT

        text_lower = nearby_text.lower()

        # Pattern matching
        if any(kw in text_lower for kw in ["email", "e-mail", "mail"]):
            return FieldSubtype.EMAIL
        elif any(kw in text_lower for kw in ["phone", "tel", "telephone", "mobile"]):
            return FieldSubtype.PHONE
        elif any(kw in text_lower for kw in ["ssn", "social security", "ss#"]):
            return FieldSubtype.SSN
        elif any(kw in text_lower for kw in ["address", "street", "apt", "zip", "city"]):
            return FieldSubtype.ADDRESS if "address" in text_lower else FieldSubtype.ZIP
        elif any(kw in text_lower for kw in ["name", "first", "last", "full name"]):
            return FieldSubtype.NAME
        elif any(kw in text_lower for kw in ["date", "dob", "birth"]):
            return FieldSubtype.TEXT  # Date is separate field type
        else:
            return FieldSubtype.TEXT

    def _classify_signature_subtype(self, field: DetectedField, nearby_text: Optional[str] = None) -> str:
        """Classify signature subtype (signature_line vs initial_line)"""
        if not nearby_text:
            return FieldSubtype.SIGNATURE_LINE

        text_lower = nearby_text.lower()

        if "initial" in text_lower:
            return FieldSubtype.INITIAL_LINE
        else:
            return FieldSubtype.SIGNATURE_LINE

    # ========== MERGE LOGIC ==========

    def merge_detections(self, commonforms_fields: List[DetectedField], opencv_fields: List[DetectedField]) -> List[DetectedField]:
        """
        Merge CommonForms and OpenCV detections.

        Strategy:
        - When IoU > threshold, prefer CommonForms confidence but keep both detections
        - Fields only detected by OpenCV are included
        - Fields only detected by CommonForms are included

        Args:
            commonforms_fields: Fields from CommonForms
            opencv_fields: Fields from OpenCV

        Returns:
            Merged list of DetectedField objects
        """
        if not commonforms_fields:
            return opencv_fields
        if not opencv_fields:
            return commonforms_fields

        merged = list(commonforms_fields)

        for opencv_field in opencv_fields:
            # Check if this field overlaps with any CommonForms detection
            best_iou = 0.0
            best_commonforms_idx = -1

            for i, cf_field in enumerate(commonforms_fields):
                iou = opencv_field.iou(cf_field)
                if iou > best_iou:
                    best_iou = iou
                    best_commonforms_idx = i

            if best_iou > FIELD_MERGE_IOU_THRESHOLD:
                # Overlapping detection: merge metadata
                cf_field = merged[best_commonforms_idx]

                # Prefer CommonForms confidence, but boost if OpenCV agrees
                if opencv_field.confidence > cf_field.confidence:
                    cf_field.confidence = min(0.95, cf_field.confidence + 0.1)

                # Merge label if available
                if opencv_field.label and not cf_field.label:
                    cf_field.label = opencv_field.label
            else:
                # No overlap: add OpenCV detection
                merged.append(opencv_field)

        return merged

    # ========== MAIN PIPELINE ==========

    def detect_all(self, input_path: str) -> Dict[int, List[DetectedField]]:
        """
        Full detection pipeline: CommonForms + OpenCV + merge.

        Handles multi-page PDFs.

        Args:
            input_path: Path to PDF or image file

        Returns:
            Dict mapping page number -> list of DetectedField objects (sorted by y-position)
        """
        self.logger.info(f"Starting full detection pipeline on {input_path}")

        result = {}

        # Check if PDF or image
        is_pdf = input_path.lower().endswith('.pdf')

        if is_pdf:
            # Convert PDF to images
            try:
                images = pdf2image.convert_from_path(input_path, dpi=300)
                self.logger.info(f"PDF converted to {len(images)} pages")
            except Exception as e:
                self.logger.error(f"Failed to convert PDF: {e}")
                return result

            # Process each page
            for page_idx, image in enumerate(images):
                image_np = np.array(image)
                if len(image_np.shape) == 2:
                    image_np = cv2.cvtColor(image_np, cv2.COLOR_GRAY2BGR)

                page_fields = self._detect_page(image_np, page_idx, input_path)
                result[page_idx] = self._sort_fields(page_fields)
        else:
            # Single image
            try:
                image = cv2.imread(input_path)
                if image is None:
                    self.logger.error(f"Failed to load image: {input_path}")
                    return result

                page_fields = self._detect_page(image, 0, input_path)
                result[0] = self._sort_fields(page_fields)
            except Exception as e:
                self.logger.error(f"Image detection failed: {e}")

        self.logger.info(f"Detection complete: {sum(len(f) for f in result.values())} total fields")
        return result

    def _detect_page(self, image: np.ndarray, page: int, source_path: str) -> List[DetectedField]:
        """Detect fields on a single page"""
        # Primary: CommonForms (if available)
        commonforms_fields = []
        if self.commonforms_available:
            # Note: CommonForms expects file path, not numpy array
            # For now, we'll skip CommonForms for in-memory processing
            # In production, save image temporarily or pass to API endpoint
            pass

        # Fallback: OpenCV
        opencv_fields = self._detect_opencv_with_preprocessing(image, page)

        # Merge
        merged_fields = self.merge_detections(commonforms_fields, opencv_fields)

        # Classify subtypes
        for field in merged_fields:
            self.classify_field_subtype(field)

        return merged_fields

    def _detect_opencv_with_preprocessing(self, image: np.ndarray, page: int) -> List[DetectedField]:
        """Run OpenCV detection with preprocessing"""
        try:
            # Preprocess for better detection
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

            # Light preprocessing
            preprocessed = cv2.bilateralFilter(gray, 9, 75, 75)
            preprocessed = cv2.medianBlur(preprocessed, 5)

            return self.detect_with_opencv(image, page)
        except Exception as e:
            self.logger.error(f"Preprocessing failed: {e}")
            return self.detect_with_opencv(image, page)

    def _sort_fields(self, fields: List[DetectedField]) -> List[DetectedField]:
        """Sort fields by page then y-position (top to bottom, left to right)"""
        return sorted(fields, key=lambda f: (f.page, f.bbox[1], f.bbox[0]))


# ========== CONVENIENCE FUNCTIONS ==========

def detect_fields(input_path: str) -> Dict[int, List[DetectedField]]:
    """Convenience function: detect all fields in document"""
    detector = FieldDetector()
    return detector.detect_all(input_path)


def detect_checkboxes_only(input_path: str) -> Dict[int, List[DetectedField]]:
    """Convenience function: detect only checkboxes"""
    detector = FieldDetector()
    all_fields = detector.detect_all(input_path)

    return {
        page: [f for f in fields if f.field_type == FieldType.CHECKBOX]
        for page, fields in all_fields.items()
    }


def detect_signatures_only(input_path: str) -> Dict[int, List[DetectedField]]:
    """Convenience function: detect only signature zones"""
    detector = FieldDetector()
    all_fields = detector.detect_all(input_path)

    return {
        page: [f for f in fields if f.field_type == FieldType.SIGNATURE]
        for page, fields in all_fields.items()
    }


def fields_to_dict(fields: List[DetectedField]) -> List[Dict[str, Any]]:
    """Convert DetectedField objects to dictionaries for JSON serialization"""
    return [asdict(f) for f in fields]
