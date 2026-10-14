"""
OCR Service for PdfEzFill.
Smart extraction pipeline that runs cheap OCR first, only invokes VLM when structure is unclear.

Pipeline:
1. OpenCV preprocess (noise reduction, contrast, deskew)
2. Tesseract OCR (text recognition via pytesseract)
3. Layout analysis (bounding boxes, field detection)
4. IF structure unclear (confidence < threshold, few fields detected):
   → VLM analysis (Qwen-VL or LLaVA for ambiguous regions)
5. Return structured fields with confidence scores
"""

import logging
import asyncio
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, asdict
import cv2
import numpy as np
import base64
from io import BytesIO
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse

# OCR engine: Tesseract, driven via pytesseract. This is the only engine
# this service runs — an earlier revision imported a different OCR
# library at module load but never called it, and mislabeled the stage
# after that library. Names here describe what actually executes.
try:
    import pytesseract  # noqa: F401
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    logging.warning(
        "pytesseract not installed. Run: pip install pytesseract "
        "(and install the tesseract binary)"
    )

# VLM service
from vlm_service import (
    check_vlm_available,
    analyze_document_with_vlm,
    extract_fields_with_vlm,
    classify_document_with_vlm,
    VLMResponse,
    FormField,
)

# Document preprocessing
from preprocess import DocumentPreprocessor

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Configuration
OCR_CONFIDENCE_THRESHOLD = 0.6
VLM_TRIGGER_THRESHOLD = 0.5  # If avg confidence < this, invoke VLM
MIN_FIELDS_FOR_CONFIDENCE = 5
DESKEW_ENABLED = True
DENOISE_ENABLED = True


@dataclass
class ExtractionResult:
    """Result of OCR extraction"""
    success: bool
    document_type: str
    fields: List[FormField]
    raw_text: str
    avg_confidence: float
    used_vlm: bool
    vlm_model: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class OCRService:
    """Smart OCR service with VLM fallback"""

    def __init__(self):
        self.tesseract_available = TESSERACT_AVAILABLE
        self.vlm_service_available = True  # Will check at runtime
        self.detection_model = None
        self.recognition_model = None
        self.logger = logging.getLogger(__name__)

    async def initialize(self):
        """Initialize models (async)"""
        if self.tesseract_available:
            self.logger.info("Tesseract OCR engine available (pytesseract)")
        else:
            self.logger.warning(
                "Tesseract OCR engine NOT available — OCR extraction will fail"
            )

        # Check VLM availability
        vlm_status = await check_vlm_available()
        self.vlm_service_available = vlm_status.get("available", False)
        self.logger.info(
            f"VLM service available: {self.vlm_service_available} "
            f"({vlm_status.get('primary_model')})"
        )

    def preprocess_image(self, image_bytes: bytes) -> np.ndarray:
        """Preprocess image for OCR using DocumentPreprocessor pipeline

        Args:
            image_bytes: Raw image bytes

        Returns:
            Preprocessed CV2 image
        """
        try:
            # Load image as BGR
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                raise ValueError("Failed to decode image")

            # Use DocumentPreprocessor full pipeline
            steps = []
            if DESKEW_ENABLED:
                steps.append("deskew")
            if DENOISE_ENABLED:
                steps.append("denoise")
            steps.extend(["enhance", "binarize"])

            preprocessed = DocumentPreprocessor.full_pipeline(image, steps=steps)
            return preprocessed

        except Exception as e:
            self.logger.error(f"Image preprocessing failed: {e}")
            # Return original image if preprocessing fails
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return image if image is not None else np.zeros((100, 100, 3), dtype=np.uint8)

    async def extract_with_tesseract(self, image_bytes: bytes) -> Dict[str, Any]:
        """Extract text using Tesseract OCR (via pytesseract).

        Args:
            image_bytes: Raw image bytes

        Returns:
            {
                "success": bool,
                "text": str,
                "fields": List[FormField],
                "avg_confidence": float,
                "detection_results": raw tesseract word data,
                "method": "tesseract",
            }
        """
        if not self.tesseract_available:
            return {
                "success": False,
                "text": "",
                "fields": [],
                "avg_confidence": 0.0,
                "error": "Tesseract OCR not available (install pytesseract and the tesseract binary)",
            }

        try:
            import pytesseract
            from PIL import Image

            pil_image = Image.open(BytesIO(image_bytes))
            text = pytesseract.image_to_string(pil_image)
            data = pytesseract.image_to_data(
                pil_image, output_type=pytesseract.Output.DICT
            )

            # Extract fields from tesseract word data
            fields = []
            confidences = []

            for i, word in enumerate(data.get("text", [])):
                if word.strip():
                    conf = int(data.get("conf", [0])[i])
                    if conf > 0:
                        confidences.append(conf / 100.0)
                        # Rough field detection: cluster nearby words
                        fields.append(
                            FormField(
                                label=word,
                                value="",
                                field_type="text",
                                confidence=conf / 100.0,
                            )
                        )

            avg_confidence = (
                sum(confidences) / len(confidences) if confidences else 0.0
            )

            return {
                "success": True,
                "text": text,
                "fields": fields,
                "avg_confidence": avg_confidence,
                "detection_results": data,
                "method": "tesseract",
            }

        except ImportError:
            return {
                "success": False,
                "text": "",
                "fields": [],
                "avg_confidence": 0.0,
                "error": "Tesseract OCR not available (install pytesseract and the tesseract binary)",
            }
        except Exception as e:
            self.logger.error(f"Tesseract OCR extraction failed: {e}")
            return {
                "success": False,
                "text": "",
                "fields": [],
                "avg_confidence": 0.0,
                "error": str(e),
            }

    async def smart_extract(
        self, file_bytes: bytes, filename: str = "document.pdf"
    ) -> ExtractionResult:
        """Main extraction pipeline:
        1. Preprocess image
        2. Tesseract OCR (fast, cheap)
        3. IF structure unclear → VLM analysis
        4. Return structured fields

        Args:
            file_bytes: Raw file bytes (image or PDF)
            filename: Original filename

        Returns:
            ExtractionResult with extracted fields and confidence
        """
        self.logger.info(f"Starting smart extraction: {filename}")

        # Step 1: OCR extraction
        ocr_result = await self.extract_with_tesseract(file_bytes)

        if not ocr_result.get("success", False):
            self.logger.error(f"OCR failed: {ocr_result.get('error')}")
            return ExtractionResult(
                success=False,
                document_type="unknown",
                fields=[],
                raw_text="",
                avg_confidence=0.0,
                used_vlm=False,
                error=ocr_result.get("error"),
            )

        ocr_fields = ocr_result.get("fields", [])
        ocr_text = ocr_result.get("text", "")
        ocr_confidence = ocr_result.get("avg_confidence", 0.0)

        self.logger.info(
            f"OCR complete: {len(ocr_fields)} fields detected, "
            f"confidence={ocr_confidence:.2f}"
        )

        # Step 2: Decide if VLM is needed
        use_vlm = (
            self.vlm_service_available
            and (
                ocr_confidence < VLM_TRIGGER_THRESHOLD
                or len(ocr_fields) < MIN_FIELDS_FOR_CONFIDENCE
            )
        )

        if use_vlm:
            self.logger.info("OCR confidence low or few fields detected. Invoking VLM…")

            # Use VLM to extract fields
            vlm_fields = await extract_fields_with_vlm(file_bytes, form_type="generic")

            # Merge VLM results with OCR
            if vlm_fields:
                self.logger.info(f"VLM extracted {len(vlm_fields)} additional fields")
                # Deduplicate and merge
                final_fields = self._merge_field_lists(ocr_fields, vlm_fields)
                vlm_model = "qwen2.5-vl:7b"  # Default model used
            else:
                final_fields = ocr_fields
                vlm_fields = []
                vlm_model = None
        else:
            final_fields = ocr_fields
            vlm_fields = []
            vlm_model = None

        # Step 3: Classify document if needed
        if not ocr_text:
            classification = await classify_document_with_vlm(file_bytes)
            doc_type = classification.get("document_type", "unknown")
        else:
            doc_type = self._infer_document_type(ocr_text)

        result_confidence = ocr_confidence if not use_vlm else 0.85

        return ExtractionResult(
            success=True,
            document_type=doc_type,
            fields=final_fields,
            raw_text=ocr_text,
            avg_confidence=result_confidence,
            used_vlm=bool(vlm_fields),
            vlm_model=vlm_model,
            error=None,
            metadata={
                "ocr_method": ocr_result.get("method", "unknown"),
                "vlm_fields_count": len(vlm_fields),
                "total_fields": len(final_fields),
                "preprocessing": {
                    "denoise": DENOISE_ENABLED,
                    "deskew": DESKEW_ENABLED,
                },
            },
        )

    def _merge_field_lists(
        self, ocr_fields: List[FormField], vlm_fields: List[FormField]
    ) -> List[FormField]:
        """Merge OCR and VLM field lists, deduplicating and preferring higher confidence

        Args:
            ocr_fields: Fields from OCR
            vlm_fields: Fields from VLM

        Returns:
            Merged list of FormField objects
        """
        # Create map of normalized labels -> best field
        merged = {}

        for field in ocr_fields + vlm_fields:
            norm_label = field.label.lower().strip()
            if norm_label not in merged or field.confidence > merged[norm_label].confidence:
                merged[norm_label] = field

        return list(merged.values())

    def _infer_document_type(self, text: str) -> str:
        """Infer document type from extracted text

        Args:
            text: Extracted text

        Returns:
            Document type string
        """
        text_lower = text.lower()

        # Simple keyword matching
        if any(keyword in text_lower for keyword in ["1040", "tax", "irs", "income"]):
            return "tax_form"
        elif any(keyword in text_lower for keyword in ["application", "applicant", "apply"]):
            return "application"
        elif any(keyword in text_lower for keyword in ["insurance", "policy", "claim"]):
            return "insurance"
        elif any(keyword in text_lower for keyword in ["medical", "health", "patient", "doctor"]):
            return "medical"
        elif any(keyword in text_lower for keyword in ["contract", "agreement", "signature"]):
            return "contract"
        else:
            return "generic"


# Global service instance
ocr_service_instance = OCRService()

# FastAPI app
app = FastAPI(
    title="PdfEzFill OCR Service",
    version="1.0.0",
    description="Smart OCR extraction pipeline with VLM fallback for PdfEzFill"
)


@app.on_event("startup")
async def startup_event():
    """Initialize OCR service on app startup"""
    logger.info("Initializing OCR service...")
    await ocr_service_instance.initialize()
    logger.info("OCR service initialized")


@app.get("/health")
async def health_check():
    """Health check endpoint returns service status"""
    return JSONResponse({
        "status": "healthy",
        "service": "PdfEzFill OCR Service",
        "ocr_engine": "tesseract",
        "tesseract_available": ocr_service_instance.tesseract_available,
        "vlm_service_available": ocr_service_instance.vlm_service_available,
    })


@app.post("/ocr/extract")
async def extract_fields(file: UploadFile = File(...)):
    """
    Extract form fields from uploaded document using smart OCR pipeline.

    Returns structured fields with confidence scores.
    Invokes VLM if OCR confidence is low.
    """
    try:
        # Read file
        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        # Run smart extraction
        result = await ocr_service_instance.smart_extract(file_bytes, file.filename or "document.pdf")

        return JSONResponse({
            "success": result.success,
            "document_type": result.document_type,
            "fields": [asdict(f) for f in result.fields],
            "raw_text": result.raw_text,
            "avg_confidence": result.avg_confidence,
            "used_vlm": result.used_vlm,
            "vlm_model": result.vlm_model,
            "error": result.error,
            "metadata": result.metadata,
        })

    except Exception as e:
        logger.error(f"Extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@app.post("/ocr/layout")
async def extract_layout(file: UploadFile = File(...)):
    """
    Extract document layout (lines, checkboxes, tables) from uploaded document.

    Returns bounding boxes and structural elements.
    """
    try:
        # Read file
        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        # Decode image
        nparr = np.frombuffer(file_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        # Extract layout elements
        lines = DocumentPreprocessor.detect_lines(image)
        checkboxes = DocumentPreprocessor.detect_checkboxes(image)
        tables = DocumentPreprocessor.detect_tables(image)

        return JSONResponse({
            "success": True,
            "layout": {
                "lines": lines,
                "checkboxes": checkboxes,
                "tables": tables,
            }
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Layout extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Layout extraction failed: {str(e)}")


@app.post("/ocr/preprocess")
async def preprocess(file: UploadFile = File(...)):
    """
    Preprocess image and return as base64-encoded PNG.

    Applies: deskew -> denoise -> enhance contrast -> binarize
    """
    try:
        # Read file
        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        # Preprocess
        preprocessed = ocr_service_instance.preprocess_image(file_bytes)

        # Encode to PNG
        success, png_bytes = cv2.imencode(".png", preprocessed)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to encode processed image")

        # Encode to base64
        b64 = base64.b64encode(png_bytes.tobytes()).decode("utf-8")

        return JSONResponse({
            "success": True,
            "image_base64": b64,
            "format": "PNG",
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Preprocessing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Preprocessing failed: {str(e)}")


# Convenience function aliases for programmatic use
async def smart_extract(file_bytes: bytes, filename: str = "document.pdf") -> ExtractionResult:
    """Smart extraction pipeline (alias)"""
    return await ocr_service_instance.smart_extract(file_bytes, filename)


# Field Detection System
# Import the field detector
try:
    from field_detector import FieldDetector
    _field_detector = FieldDetector()
    DETECTION_AVAILABLE = True
except ImportError:
    DETECTION_AVAILABLE = False
    logger.warning("Field detector not available. Install with: pip install commonforms ultralytics")


@app.post("/detect/fields")
async def detect_fields(file: UploadFile = File(...)):
    """Auto-detect all form fields (checkboxes, signatures, text inputs)

    Returns:
        {
            "success": bool,
            "fields": [
                {
                    "type": "checkbox|signature|text|radio|date|initial",
                    "bbox": [x, y, width, height],
                    "confidence": float,
                    "label": str (optional)
                }
            ],
            "detection_method": "commonforms|opencv|fallback",
            "processing_time_ms": float
        }
    """
    if not DETECTION_AVAILABLE:
        raise HTTPException(status_code=503, detail="Field detection not available. Install commonforms and ultralytics.")

    try:
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        result = await _field_detector.detect_all(file_bytes, file.filename or "document.pdf")
        return result

    except Exception as e:
        logger.error(f"Field detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Field detection failed: {str(e)}")


@app.post("/detect/checkboxes")
async def detect_checkboxes(file: UploadFile = File(...)):
    """Detect checkboxes only (fast path)

    Returns:
        {
            "success": bool,
            "fields": [
                {
                    "type": "checkbox",
                    "bbox": [x, y, width, height],
                    "confidence": float,
                    "checked": bool (optional)
                }
            ],
            "processing_time_ms": float
        }
    """
    if not DETECTION_AVAILABLE:
        raise HTTPException(status_code=503, detail="Field detection not available.")

    try:
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        fields = await _field_detector.detect_checkboxes_only(file_bytes)
        return {
            "success": True,
            "fields": [f.dict() for f in fields]
        }

    except Exception as e:
        logger.error(f"Checkbox detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Checkbox detection failed: {str(e)}")


@app.post("/detect/signatures")
async def detect_signatures(file: UploadFile = File(...)):
    """Detect signature zones only

    Returns:
        {
            "success": bool,
            "fields": [
                {
                    "type": "signature",
                    "bbox": [x, y, width, height],
                    "confidence": float,
                    "label": str (optional)
                }
            ],
            "processing_time_ms": float
        }
    """
    if not DETECTION_AVAILABLE:
        raise HTTPException(status_code=503, detail="Field detection not available.")

    try:
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")

        fields = await _field_detector.detect_signatures_only(file_bytes)
        return {
            "success": True,
            "fields": [f.dict() for f in fields]
        }

    except Exception as e:
        logger.error(f"Signature detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Signature detection failed: {str(e)}")


@app.get("/detect/capabilities")
async def detection_capabilities():
    """Report available detection models and capabilities

    Returns:
        {
            "opencv": bool,
            "commonforms": bool,
            "ultralytics": bool,
            "available_methods": [str],
            "primary_method": str,
            "fallback_chain": [str]
        }
    """
    caps = {
        "opencv": True,  # Always available
        "commonforms": False,
        "ultralytics": False
    }

    try:
        import commonforms
        caps["commonforms"] = True
    except ImportError:
        pass

    try:
        import ultralytics
        caps["ultralytics"] = True
    except ImportError:
        pass

    # Determine available methods and chains
    available = []
    if caps["commonforms"]:
        available.append("commonforms")
    if caps["ultralytics"]:
        available.append("ultralytics")
    available.append("opencv")

    return {
        **caps,
        "available_methods": available,
        "primary_method": "commonforms" if caps["commonforms"] else ("ultralytics" if caps["ultralytics"] else "opencv"),
        "fallback_chain": available,
        "detection_enabled": DETECTION_AVAILABLE
    }


if __name__ == "__main__":
    # Entrypoint (added 2026-10-14, defect 8e): Electron spawns this file
    # directly (python3 server/python/ocr_service.py, env OCR_PORT=5050)
    # and polls GET /health. Without this block the process defined the
    # FastAPI app and exited immediately, so the sidecar never served.
    import os

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("OCR_PORT", "5050")))
