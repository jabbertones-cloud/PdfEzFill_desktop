"""
OpenCV-based image preprocessing for scanned documents
Handles deskewing, denoising, binarization, and contrast enhancement
"""

import cv2
import numpy as np
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)


class DocumentPreprocessor:
    """Advanced preprocessing for document images"""

    # Thresholds for various operations
    MIN_LINE_LENGTH = 50
    MIN_CHECKBOX_WIDTH = 10
    MAX_CHECKBOX_WIDTH = 100
    CHECKBOX_ASPECT_RATIO_RANGE = (0.7, 1.3)

    @staticmethod
    def deskew(image: np.ndarray, max_angle: float = 45.0) -> np.ndarray:
        """
        Detect and correct image rotation using Hough Line Transform.

        Args:
            image: Input image (BGR or grayscale)
            max_angle: Maximum rotation angle to detect (degrees)

        Returns:
            Deskewed image
        """
        # Convert to grayscale if needed
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

        # Detect edges
        edges = cv2.Canny(gray, 50, 150)

        # Hough Line Transform
        lines = cv2.HoughLines(edges, 1, np.pi / 180, 100)

        if lines is not None and len(lines) > 0:
            angles = []

            for line in lines:
                rho, theta = line[0]
                # Convert theta to degrees and adjust
                angle_deg = np.degrees(theta) - 90

                # Filter out extreme angles
                if abs(angle_deg) < max_angle:
                    angles.append(angle_deg)

            if angles:
                # Use median for robustness
                median_angle = np.median(angles)

                if abs(median_angle) > 0.5:  # Only rotate if significant
                    h, w = gray.shape if len(gray.shape) == 2 else (gray.shape[0], gray.shape[1])
                    center = (w // 2, h // 2)

                    # Get rotation matrix
                    rot_matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)

                    # Apply rotation
                    if len(image.shape) == 3:
                        image = cv2.warpAffine(image, rot_matrix, (w, h),
                                             borderMode=cv2.BORDER_REPLICATE)
                    else:
                        gray = cv2.warpAffine(gray, rot_matrix, (w, h),
                                            borderMode=cv2.BORDER_REPLICATE)
                        image = gray

                    logger.debug(f"Deskewed image by {median_angle:.2f} degrees")

        return image

    @staticmethod
    def denoise(image: np.ndarray, kernel_size: int = 9) -> np.ndarray:
        """
        Remove noise using bilateral filtering (preserves edges).

        Args:
            image: Input image
            kernel_size: Bilateral filter kernel size

        Returns:
            Denoised image
        """
        denoised = cv2.bilateralFilter(image, kernel_size, 75, 75)
        logger.debug("Applied bilateral denoising")
        return denoised

    @staticmethod
    def binarize(image: np.ndarray, method: str = "adaptive") -> np.ndarray:
        """
        Convert to binary image using adaptive or global thresholding.

        Args:
            image: Input image
            method: "adaptive" or "global"

        Returns:
            Binary image (single channel, converted to BGR for consistency)
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

        if method == "adaptive":
            # Adaptive thresholding for varying lighting
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2
            )
        else:
            # Global thresholding with Otsu's method
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        logger.debug(f"Applied {method} binarization")

        # Convert back to BGR for consistency
        return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

    @staticmethod
    def enhance_contrast(image: np.ndarray, clip_limit: float = 2.0,
                        tile_size: Tuple[int, int] = (8, 8)) -> np.ndarray:
        """
        Enhance contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization).

        Args:
            image: Input image
            clip_limit: Contrast limit
            tile_size: Size of grid tiles for local histogram equalization

        Returns:
            Contrast-enhanced image
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_size)
        enhanced = clahe.apply(gray)

        logger.debug(f"Applied CLAHE contrast enhancement (clip_limit={clip_limit})")

        # Convert back to BGR
        return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    @staticmethod
    def detect_lines(image: np.ndarray) -> Dict[str, List[Dict]]:
        """
        Detect horizontal and vertical lines in document (form structure).

        Args:
            image: Input image

        Returns:
            Dictionary with 'horizontal' and 'vertical' line lists
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

        # Morphological operations to extract lines
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
        horizontal_lines = cv2.morphologyEx(gray, cv2.MORPH_OPEN, horizontal_kernel)

        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
        vertical_lines = cv2.morphologyEx(gray, cv2.MORPH_OPEN, vertical_kernel)

        lines_result = {'horizontal': [], 'vertical': []}

        # Process horizontal lines
        h_contours, _ = cv2.findContours(horizontal_lines, cv2.RETR_EXTERNAL,
                                         cv2.CHAIN_APPROX_SIMPLE)
        for contour in h_contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w > DocumentPreprocessor.MIN_LINE_LENGTH:
                lines_result['horizontal'].append({
                    'x': int(x),
                    'y': int(y),
                    'width': int(w),
                    'height': int(h),
                    'length': int(w)
                })

        # Process vertical lines
        v_contours, _ = cv2.findContours(vertical_lines, cv2.RETR_EXTERNAL,
                                         cv2.CHAIN_APPROX_SIMPLE)
        for contour in v_contours:
            x, y, w, h = cv2.boundingRect(contour)
            if h > DocumentPreprocessor.MIN_LINE_LENGTH:
                lines_result['vertical'].append({
                    'x': int(x),
                    'y': int(y),
                    'width': int(w),
                    'height': int(h),
                    'length': int(h)
                })

        logger.debug(f"Detected {len(lines_result['horizontal'])} horizontal and "
                    f"{len(lines_result['vertical'])} vertical lines")

        return lines_result

    @staticmethod
    def detect_checkboxes(image: np.ndarray) -> List[Dict]:
        """
        Detect checkbox-shaped regions (filled or empty).

        Args:
            image: Input image

        Returns:
            List of detected checkbox regions with bounding boxes
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

        # Apply threshold
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)

        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)

        checkboxes = []

        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)

            # Filter by size and aspect ratio (checkboxes are roughly square)
            if (DocumentPreprocessor.MIN_CHECKBOX_WIDTH < w < DocumentPreprocessor.MAX_CHECKBOX_WIDTH and
                DocumentPreprocessor.MIN_CHECKBOX_WIDTH < h < DocumentPreprocessor.MAX_CHECKBOX_WIDTH):

                aspect_ratio = w / h if h > 0 else 0

                if (DocumentPreprocessor.CHECKBOX_ASPECT_RATIO_RANGE[0] <
                    aspect_ratio <
                    DocumentPreprocessor.CHECKBOX_ASPECT_RATIO_RANGE[1]):

                    checkboxes.append({
                        'x': int(x),
                        'y': int(y),
                        'width': int(w),
                        'height': int(h),
                        'aspect_ratio': float(aspect_ratio),
                        'area': int(w * h)
                    })

        logger.debug(f"Detected {len(checkboxes)} checkboxes")

        return checkboxes

    @staticmethod
    def detect_tables(image: np.ndarray) -> List[Dict]:
        """
        Detect table regions based on line patterns.

        Args:
            image: Input image

        Returns:
            List of detected table regions
        """
        lines = DocumentPreprocessor.detect_lines(image)

        tables = []

        # Simple heuristic: dense line regions form tables
        # Group lines that form rectangular grids
        if lines['horizontal'] and lines['vertical']:
            # Find intersection regions with multiple crossings
            h_positions = sorted([line['y'] for line in lines['horizontal']])
            v_positions = sorted([line['x'] for line in lines['vertical']])

            # Identify clusters of lines that form table grids
            for i in range(len(h_positions) - 1):
                for j in range(len(v_positions) - 1):
                    tables.append({
                        'type': 'table_cell',
                        'x': int(v_positions[j]),
                        'y': int(h_positions[i]),
                        'x_next': int(v_positions[j + 1]),
                        'y_next': int(h_positions[i + 1])
                    })

        logger.debug(f"Detected {len(tables)} potential table regions")

        return tables[:100]  # Limit to prevent explosion

    @staticmethod
    def full_pipeline(image: np.ndarray, steps: List[str] = None) -> np.ndarray:
        """
        Apply full preprocessing pipeline with customizable steps.

        Default pipeline: deskew -> denoise -> enhance -> binarize

        Args:
            image: Input image
            steps: List of preprocessing steps to apply
                   Default: ["deskew", "denoise", "enhance", "binarize"]

        Returns:
            Preprocessed image
        """
        if steps is None:
            steps = ["deskew", "denoise", "enhance", "binarize"]

        logger.info(f"Starting preprocessing pipeline: {' -> '.join(steps)}")

        for step in steps:
            if step == "deskew":
                image = DocumentPreprocessor.deskew(image)
            elif step == "denoise":
                image = DocumentPreprocessor.denoise(image)
            elif step == "enhance":
                image = DocumentPreprocessor.enhance_contrast(image)
            elif step == "binarize":
                image = DocumentPreprocessor.binarize(image)
            else:
                logger.warning(f"Unknown preprocessing step: {step}")

        logger.info("Preprocessing pipeline complete")

        return image


# Convenience functions for direct use
def deskew(image: np.ndarray) -> np.ndarray:
    """Deskew image"""
    return DocumentPreprocessor.deskew(image)


def denoise(image: np.ndarray) -> np.ndarray:
    """Denoise image"""
    return DocumentPreprocessor.denoise(image)


def binarize(image: np.ndarray) -> np.ndarray:
    """Binarize image"""
    return DocumentPreprocessor.binarize(image)


def enhance_contrast(image: np.ndarray) -> np.ndarray:
    """Enhance contrast"""
    return DocumentPreprocessor.enhance_contrast(image)


def detect_lines(image: np.ndarray) -> Dict[str, List[Dict]]:
    """Detect lines"""
    return DocumentPreprocessor.detect_lines(image)


def detect_checkboxes(image: np.ndarray) -> List[Dict]:
    """Detect checkboxes"""
    return DocumentPreprocessor.detect_checkboxes(image)


def preprocess_for_ocr(image: np.ndarray) -> np.ndarray:
    """Full preprocessing pipeline for OCR"""
    return DocumentPreprocessor.full_pipeline(image)
