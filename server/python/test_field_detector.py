"""
Test suite for FieldDetector service.

Run tests with:
    python test_field_detector.py --verbose

Tests OpenCV detection, field classification, and merge logic.
"""

import unittest
import numpy as np
import cv2
import tempfile
import os
from pathlib import Path

from field_detector import (
    FieldDetector,
    DetectedField,
    FieldType,
    FieldSubtype,
    CHECKBOX_MIN_AREA,
    CHECKBOX_MAX_AREA,
)


class TestDetectedField(unittest.TestCase):
    """Test DetectedField dataclass"""

    def test_field_creation(self):
        """Test creating a DetectedField"""
        field = DetectedField(
            field_type="checkbox",
            bbox=[0.1, 0.2, 0.05, 0.05],
            confidence=0.85,
            page=0,
            state="unchecked",
            label="Test",
        )

        self.assertEqual(field.field_type, "checkbox")
        self.assertEqual(field.bbox, [0.1, 0.2, 0.05, 0.05])
        self.assertEqual(field.confidence, 0.85)
        self.assertEqual(field.page, 0)
        self.assertEqual(field.state, "unchecked")

    def test_invalid_bbox(self):
        """Test that invalid bbox raises error"""
        # Bbox with 3 elements should fail
        with self.assertRaises(ValueError):
            DetectedField(
                field_type="checkbox",
                bbox=[0.1, 0.2, 0.05],
                confidence=0.85,
                page=0,
            )

        # Bbox outside 0-1 range should fail
        with self.assertRaises(ValueError):
            DetectedField(
                field_type="checkbox",
                bbox=[0.1, 0.2, 0.05, 1.5],
                confidence=0.85,
                page=0,
            )

    def test_iou_calculation(self):
        """Test Intersection over Union calculation"""
        field1 = DetectedField(
            field_type="checkbox",
            bbox=[0.1, 0.1, 0.1, 0.1],
            confidence=0.8,
            page=0,
        )

        # Exact same box
        field2 = DetectedField(
            field_type="checkbox",
            bbox=[0.1, 0.1, 0.1, 0.1],
            confidence=0.9,
            page=0,
        )
        self.assertAlmostEqual(field1.iou(field2), 1.0, places=5)

        # 50% overlap
        field3 = DetectedField(
            field_type="checkbox",
            bbox=[0.15, 0.1, 0.1, 0.1],
            confidence=0.9,
            page=0,
        )
        self.assertGreater(field1.iou(field3), 0.4)
        self.assertLess(field1.iou(field3), 0.6)

        # No overlap
        field4 = DetectedField(
            field_type="checkbox",
            bbox=[0.5, 0.5, 0.1, 0.1],
            confidence=0.9,
            page=0,
        )
        self.assertEqual(field1.iou(field4), 0.0)

        # Different pages
        field5 = DetectedField(
            field_type="checkbox",
            bbox=[0.1, 0.1, 0.1, 0.1],
            confidence=0.9,
            page=1,
        )
        self.assertEqual(field1.iou(field5), 0.0)


class TestFieldDetector(unittest.TestCase):
    """Test FieldDetector methods"""

    def setUp(self):
        """Initialize detector for each test"""
        self.detector = FieldDetector()

    def test_detector_initialization(self):
        """Test detector initializes correctly"""
        self.assertIsNotNone(self.detector)
        # CommonForms availability check
        print(
            f"CommonForms available: {self.detector.commonforms_available}"
        )

    def test_normalize_bbox(self):
        """Test bbox normalization"""
        # Bbox in 1000x1400 page
        bbox = [100, 200, 50, 50]
        normalized = self.detector._normalize_bbox(bbox, 1000, 1400)

        self.assertAlmostEqual(normalized[0], 0.1, places=5)  # x
        self.assertAlmostEqual(normalized[1], 200 / 1400, places=5)  # y
        self.assertAlmostEqual(normalized[2], 0.05, places=5)  # width
        self.assertAlmostEqual(normalized[3], 50 / 1400, places=5)  # height

    def test_classify_textinput_subtype(self):
        """Test text input subtype classification"""
        field = DetectedField(
            field_type="text_input",
            bbox=[0.1, 0.2, 0.3, 0.03],
            confidence=0.7,
            page=0,
        )

        # Email
        self.detector.classify_field_subtype(field, "Email Address")
        self.assertEqual(field.subtype, FieldSubtype.EMAIL)

        # Phone
        field.subtype = None
        self.detector.classify_field_subtype(field, "Phone Number")
        self.assertEqual(field.subtype, FieldSubtype.PHONE)

        # SSN
        field.subtype = None
        self.detector.classify_field_subtype(field, "Social Security #")
        self.assertEqual(field.subtype, FieldSubtype.SSN)

        # Name
        field.subtype = None
        self.detector.classify_field_subtype(field, "Full Name")
        self.assertEqual(field.subtype, FieldSubtype.NAME)

        # Default
        field.subtype = None
        self.detector.classify_field_subtype(field, None)
        self.assertEqual(field.subtype, FieldSubtype.TEXT)

    def test_classify_signature_subtype(self):
        """Test signature subtype classification"""
        field = DetectedField(
            field_type="signature",
            bbox=[0.1, 0.8, 0.3, 0.05],
            confidence=0.7,
            page=0,
        )

        # Signature
        self.detector.classify_field_subtype(field, "Signature")
        self.assertEqual(field.subtype, FieldSubtype.SIGNATURE_LINE)

        # Initial
        field.subtype = None
        self.detector.classify_field_subtype(field, "Initial")
        self.assertEqual(field.subtype, FieldSubtype.INITIAL_LINE)

    def test_merge_horizontal_lines(self):
        """Test horizontal line merging"""
        # Three overlapping horizontal lines
        lines = [
            [[10, 100, 50, 100]],
            [[45, 100, 80, 100]],
            [[200, 100, 250, 100]],
        ]

        merged = self.detector._merge_horizontal_lines(lines)

        # First two should merge, third separate
        self.assertGreaterEqual(len(merged), 2)

    def test_merge_detections(self):
        """Test merging CommonForms and OpenCV detections"""
        # CommonForms detection
        cf_field = DetectedField(
            field_type="checkbox",
            bbox=[0.1, 0.2, 0.05, 0.05],
            confidence=0.9,
            page=0,
            state="unchecked",
            label="Agreement",
            source="commonforms",
        )

        # OpenCV detection (same region)
        cv_field = DetectedField(
            field_type="checkbox",
            bbox=[0.105, 0.205, 0.05, 0.05],
            confidence=0.7,
            page=0,
            state="unchecked",
            source="opencv",
        )

        merged = self.detector.merge_detections([cf_field], [cv_field])

        # Should merge into one field, prefer CommonForms confidence
        self.assertEqual(len(merged), 1)
        self.assertGreater(merged[0].confidence, cf_field.confidence)

    def test_merge_detections_non_overlapping(self):
        """Test merging non-overlapping detections"""
        cf_field = DetectedField(
            field_type="checkbox",
            bbox=[0.1, 0.2, 0.05, 0.05],
            confidence=0.9,
            page=0,
            source="commonforms",
        )

        # Different region
        cv_field = DetectedField(
            field_type="text_input",
            bbox=[0.5, 0.5, 0.3, 0.03],
            confidence=0.7,
            page=0,
            source="opencv",
        )

        merged = self.detector.merge_detections([cf_field], [cv_field])

        # Should keep both
        self.assertEqual(len(merged), 2)

    def test_sort_fields(self):
        """Test field sorting by page and position"""
        fields = [
            DetectedField(
                field_type="text_input",
                bbox=[0.5, 0.2, 0.3, 0.03],
                confidence=0.7,
                page=0,
                source="opencv",
            ),
            DetectedField(
                field_type="checkbox",
                bbox=[0.1, 0.1, 0.05, 0.05],
                confidence=0.8,
                page=0,
                source="opencv",
            ),
            DetectedField(
                field_type="signature",
                bbox=[0.1, 0.8, 0.3, 0.05],
                confidence=0.75,
                page=1,
                source="opencv",
            ),
        ]

        sorted_fields = self.detector._sort_fields(fields)

        # Should be sorted by page then y-position
        self.assertEqual(sorted_fields[0].field_type, "checkbox")  # page 0, y=0.1
        self.assertEqual(sorted_fields[1].field_type, "text_input")  # page 0, y=0.2
        self.assertEqual(sorted_fields[2].field_type, "signature")  # page 1, y=0.8


class TestOpenCVDetection(unittest.TestCase):
    """Test OpenCV detection on synthetic images"""

    def setUp(self):
        """Create test images"""
        self.detector = FieldDetector()
        self.page_width = 1000
        self.page_height = 1400

    def create_blank_page(self) -> np.ndarray:
        """Create blank white page"""
        return np.ones((self.page_height, self.page_width, 3), dtype=np.uint8) * 255

    def draw_checkbox(
        self,
        image: np.ndarray,
        x: int,
        y: int,
        size: int,
        filled: bool = False,
    ) -> None:
        """Draw a checkbox on image"""
        if filled:
            cv2.rectangle(image, (x, y), (x + size, y + size), (0, 0, 0), -1)
        else:
            cv2.rectangle(image, (x, y), (x + size, y + size), (0, 0, 0), 2)

    def draw_horizontal_line(
        self, image: np.ndarray, x1: int, y: int, x2: int
    ) -> None:
        """Draw a horizontal line (text input field)"""
        cv2.line(image, (x1, y), (x2, y), (0, 0, 0), 2)

    def test_checkbox_detection(self):
        """Test checkbox detection on synthetic image"""
        # Create test image with checkbox
        image = self.create_blank_page()
        self.draw_checkbox(image, 100, 200, 30, filled=False)
        self.draw_checkbox(image, 200, 200, 30, filled=True)

        # Detect
        fields = self.detector.detect_with_opencv(image, page=0)

        # Filter checkboxes
        checkboxes = [f for f in fields if f.field_type == "checkbox"]

        # Should detect at least one checkbox
        self.assertGreater(len(checkboxes), 0)

        # Check normalized coordinates
        for checkbox in checkboxes:
            self.assertTrue(all(0.0 <= v <= 1.0 for v in checkbox.bbox))

    def test_text_input_detection(self):
        """Test text input detection on synthetic image"""
        image = self.create_blank_page()

        # Draw horizontal lines for text inputs
        self.draw_horizontal_line(image, 100, 400, 400)
        self.draw_horizontal_line(image, 100, 500, 500)

        # Detect
        fields = self.detector.detect_with_opencv(image, page=0)

        # Filter text inputs
        text_inputs = [f for f in fields if f.field_type == "text_input"]

        # Should detect lines as text inputs
        self.assertGreater(len(text_inputs), 0)

        # Check normalized coordinates
        for field in text_inputs:
            self.assertTrue(all(0.0 <= v <= 1.0 for v in field.bbox))


class TestIntegration(unittest.TestCase):
    """Integration tests"""

    def setUp(self):
        self.detector = FieldDetector()

    def test_fields_to_dict(self):
        """Test conversion to dictionary"""
        from field_detector import fields_to_dict

        field = DetectedField(
            field_type="checkbox",
            bbox=[0.1, 0.2, 0.05, 0.05],
            confidence=0.85,
            page=0,
            state="unchecked",
            label="Test",
        )

        field_dict = fields_to_dict([field])

        self.assertEqual(len(field_dict), 1)
        self.assertEqual(field_dict[0]["field_type"], "checkbox")
        self.assertEqual(field_dict[0]["confidence"], 0.85)
        self.assertEqual(field_dict[0]["state"], "unchecked")


def run_tests():
    """Run all tests"""
    unittest.main(verbosity=2)


if __name__ == "__main__":
    print("Running FieldDetector test suite...")
    print("=" * 60)
    run_tests()
