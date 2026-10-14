"""
FastAPI Endpoints for Form Field Detection

This module provides endpoints that can be integrated into ocr_service.py
or run as a standalone service on port 5051.

Integration into ocr_service.py:
1. Import this module
2. Call register_field_detector_endpoints(app) in startup
3. Endpoints will be available at /detect/* paths
"""

import logging
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import tempfile
import os

from field_detector import FieldDetector, DetectedField, fields_to_dict

logger = logging.getLogger(__name__)

# Global detector instance
field_detector_instance: Optional[FieldDetector] = None


def initialize_field_detector():
    """Initialize the field detector (call in app startup)"""
    global field_detector_instance
    if field_detector_instance is None:
        field_detector_instance = FieldDetector()
        logger.info("Field detector initialized")
        logger.info(f"CommonForms available: {field_detector_instance.commonforms_available}")


async def get_detector() -> FieldDetector:
    """Get the global field detector instance"""
    if field_detector_instance is None:
        initialize_field_detector()
    return field_detector_instance


# ========== ENDPOINTS ==========

async def detect_all_fields(file: UploadFile = File(...)):
    """
    Detect all form fields in uploaded document.

    Runs full detection pipeline:
    1. CommonForms/FFDNet (primary)
    2. OpenCV fallback
    3. Merge and classify

    Returns fields organized by page with normalized coordinates and confidence.

    Response:
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
                ...
            ],
            "1": [...]
        },
        "total_fields": 42,
        "pages": 2
    }
    """
    try:
        # Read file
        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        # Save to temp file (detector expects file path for PDF)
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            detector = await get_detector()

            # Run detection
            logger.info(f"Detecting fields in {file.filename}")
            fields_by_page = detector.detect_all(tmp_path)

            # Convert to JSON-serializable format
            response_fields = {}
            total_fields = 0

            for page, fields in fields_by_page.items():
                response_fields[str(page)] = fields_to_dict(fields)
                total_fields += len(fields)

            return JSONResponse({
                "success": True,
                "fields_by_page": response_fields,
                "total_fields": total_fields,
                "pages": len(fields_by_page),
                "file": file.filename
            })

        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Field detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


async def detect_checkboxes(file: UploadFile = File(...)):
    """
    Detect only checkboxes in uploaded document.

    Returns checkbox fields with state (checked/unchecked).

    Response:
    {
        "success": true,
        "checkboxes_by_page": {
            "0": [
                {
                    "field_type": "checkbox",
                    "bbox": [0.1, 0.2, 0.05, 0.05],
                    "confidence": 0.85,
                    "page": 0,
                    "state": "unchecked",
                    "label": "Option A",
                    "source": "opencv"
                }
            ]
        },
        "total_checkboxes": 8
    }
    """
    try:
        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            detector = await get_detector()

            logger.info(f"Detecting checkboxes in {file.filename}")
            fields_by_page = detector.detect_all(tmp_path)

            # Filter for checkboxes only
            response_checkboxes = {}
            total_checkboxes = 0

            for page, fields in fields_by_page.items():
                checkboxes = [f for f in fields if f.field_type == "checkbox"]
                response_checkboxes[str(page)] = fields_to_dict(checkboxes)
                total_checkboxes += len(checkboxes)

            return JSONResponse({
                "success": True,
                "checkboxes_by_page": response_checkboxes,
                "total_checkboxes": total_checkboxes,
                "file": file.filename
            })

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Checkbox detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


async def detect_signatures(file: UploadFile = File(...)):
    """
    Detect signature zones in uploaded document.

    Returns signature field locations.

    Response:
    {
        "success": true,
        "signatures_by_page": {
            "0": [
                {
                    "field_type": "signature",
                    "bbox": [0.1, 0.85, 0.3, 0.1],
                    "confidence": 0.72,
                    "page": 0,
                    "label": "Signature",
                    "subtype": "signature_line"
                }
            ]
        },
        "total_signatures": 1
    }
    """
    try:
        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            detector = await get_detector()

            logger.info(f"Detecting signatures in {file.filename}")
            fields_by_page = detector.detect_all(tmp_path)

            # Filter for signatures only
            response_signatures = {}
            total_signatures = 0

            for page, fields in fields_by_page.items():
                signatures = [f for f in fields if f.field_type == "signature"]
                response_signatures[str(page)] = fields_to_dict(signatures)
                total_signatures += len(signatures)

            return JSONResponse({
                "success": True,
                "signatures_by_page": response_signatures,
                "total_signatures": total_signatures,
                "file": file.filename
            })

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signature detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


async def detect_text_inputs(file: UploadFile = File(...)):
    """
    Detect text input fields in uploaded document.

    Attempts to classify subtypes (email, phone, SSN, etc.) based on nearby labels.

    Response:
    {
        "success": true,
        "text_inputs_by_page": {
            "0": [
                {
                    "field_type": "text_input",
                    "bbox": [0.1, 0.2, 0.3, 0.03],
                    "confidence": 0.68,
                    "page": 0,
                    "label": "Email Address",
                    "subtype": "email"
                }
            ]
        },
        "total_text_inputs": 12
    }
    """
    try:
        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            detector = await get_detector()

            logger.info(f"Detecting text inputs in {file.filename}")
            fields_by_page = detector.detect_all(tmp_path)

            # Filter for text inputs
            response_inputs = {}
            total_inputs = 0

            for page, fields in fields_by_page.items():
                inputs = [f for f in fields if f.field_type == "text_input"]
                response_inputs[str(page)] = fields_to_dict(inputs)
                total_inputs += len(inputs)

            return JSONResponse({
                "success": True,
                "text_inputs_by_page": response_inputs,
                "total_text_inputs": total_inputs,
                "file": file.filename
            })

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Text input detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


async def detect_capabilities():
    """
    Get available detection capabilities.

    Returns info about enabled detection methods and features.

    Response:
    {
        "success": true,
        "methods": {
            "commonforms": {
                "available": true,
                "description": "YOLO11-based form field detection (best accuracy)"
            },
            "opencv": {
                "available": true,
                "description": "OpenCV heuristic detection (fallback, pure computer vision)"
            }
        },
        "field_types_supported": [
            "checkbox",
            "radio",
            "text_input",
            "signature",
            "dropdown"
        ],
        "text_subtypes_supported": [
            "text",
            "email",
            "phone",
            "ssn",
            "address",
            "name",
            "zip"
        ],
        "features": {
            "checkbox_state_detection": true,
            "signature_zone_detection": true,
            "text_subtype_classification": true,
            "multi_page_support": true,
            "merged_detection": true
        }
    }
    """
    detector = await get_detector()

    return JSONResponse({
        "success": True,
        "methods": {
            "commonforms": {
                "available": detector.commonforms_available,
                "description": "YOLO11-based form field detection (best accuracy)"
            },
            "opencv": {
                "available": True,
                "description": "OpenCV heuristic detection (fallback, pure computer vision, no ML models required)"
            }
        },
        "field_types_supported": [
            "checkbox",
            "radio",
            "text_input",
            "signature",
            "date",
            "initial",
            "dropdown"
        ],
        "text_subtypes_supported": [
            "text",
            "email",
            "phone",
            "ssn",
            "address",
            "name",
            "zip"
        ],
        "signature_subtypes_supported": [
            "signature_line",
            "initial_line"
        ],
        "features": {
            "checkbox_state_detection": True,
            "signature_zone_detection": True,
            "text_subtype_classification": True,
            "multi_page_support": True,
            "merged_detection": True,
            "normalized_coordinates": True,
            "confidence_scores": True
        },
        "coordinate_system": {
            "format": "[x, y, width, height]",
            "range": "0.0 to 1.0 (normalized to page size)",
            "origin": "top-left"
        }
    })


def register_field_detector_endpoints(app: FastAPI):
    """Register field detector endpoints with a FastAPI app

    Usage in ocr_service.py:
    ```python
    from field_detector_endpoints import register_field_detector_endpoints

    @app.on_event("startup")
    async def startup_event():
        # ... existing init code ...
        register_field_detector_endpoints(app)
    ```
    """
    # Initialize on registration
    initialize_field_detector()

    # Register endpoints
    app.add_api_route(
        "/detect/fields",
        detect_all_fields,
        methods=["POST"],
        summary="Detect all form fields",
        description="Detect checkboxes, signatures, text inputs, and other form fields"
    )

    app.add_api_route(
        "/detect/checkboxes",
        detect_checkboxes,
        methods=["POST"],
        summary="Detect checkboxes only"
    )

    app.add_api_route(
        "/detect/signatures",
        detect_signatures,
        methods=["POST"],
        summary="Detect signature zones"
    )

    app.add_api_route(
        "/detect/text-inputs",
        detect_text_inputs,
        methods=["POST"],
        summary="Detect text input fields"
    )

    app.add_api_route(
        "/detect/capabilities",
        detect_capabilities,
        methods=["GET"],
        summary="Get available detection capabilities"
    )

    logger.info("Field detector endpoints registered")


if __name__ == "__main__":
    # Standalone test server
    import uvicorn

    app = FastAPI(
        title="PdfEzFill Field Detector",
        version="1.0.0",
        description="Automatic form field detection service"
    )

    @app.on_event("startup")
    async def startup():
        initialize_field_detector()

    # Register endpoints
    register_field_detector_endpoints(app)

    logger.info("Starting Field Detector service on port 5051")
    uvicorn.run(app, host="0.0.0.0", port=5051, log_level="info")
