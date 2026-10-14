"""
Local Vision-Language Model service for PdfEzFill.
Replaces OpenAI Vision API with free, self-hosted models.

Priority chain:
1. Qwen2.5-VL (best for documents) — via Ollama or transformers
2. LLaVA (widely available) — via Ollama
3. Fallback: structured OCR only (no VLM)

The VLM is only called when OCR + layout detection produces ambiguous results.
Most forms (80%+) are handled by Surya OCR alone without needing VLM.
"""

import os
import json
import base64
import asyncio
import logging
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
import httpx

# Configuration
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
VLM_MODEL = os.getenv("VLM_MODEL", "qwen2.5-vl:7b")
VLM_FALLBACK = os.getenv("VLM_FALLBACK", "llava:13b")
VLM_TIMEOUT = int(os.getenv("VLM_TIMEOUT", "30"))
VLM_ENABLED = os.getenv("VLM_ENABLED", "true").lower() in ("true", "1", "yes")

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


@dataclass
class VLMResponse:
    """Structured response from VLM analysis"""
    success: bool
    model_used: str
    text: str
    structured_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    confidence: float = 0.0


@dataclass
class FormField:
    """Extracted form field"""
    label: str
    value: str
    field_type: str  # "text", "checkbox", "radio", "dropdown", etc.
    bbox: Optional[Dict[str, float]] = None
    confidence: float = 0.8


class VLMService:
    """Vision-Language Model service for document analysis"""

    def __init__(self):
        self.ollama_url = OLLAMA_URL.rstrip("/")
        self.primary_model = VLM_MODEL
        self.fallback_model = VLM_FALLBACK
        self.timeout = VLM_TIMEOUT
        self.enabled = VLM_ENABLED
        self._model_cache = {}

    async def check_vlm_available(self) -> Dict[str, Any]:
        """Check if Ollama + VLM model is available

        Returns:
            {
                "available": bool,
                "ollama_running": bool,
                "primary_model": str,
                "primary_available": bool,
                "fallback_model": str,
                "fallback_available": bool,
                "error": Optional[str]
            }
        """
        if not self.enabled:
            return {
                "available": False,
                "error": "VLM service disabled (VLM_ENABLED=false)",
                "ollama_running": False,
                "primary_model": self.primary_model,
                "primary_available": False,
                "fallback_model": self.fallback_model,
                "fallback_available": False,
            }

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                # Check Ollama connectivity
                res = await client.get(f"{self.ollama_url}/api/tags")
                if res.status_code != 200:
                    return {
                        "available": False,
                        "error": f"Ollama returned {res.status_code}",
                        "ollama_running": False,
                        "primary_model": self.primary_model,
                        "primary_available": False,
                        "fallback_model": self.fallback_model,
                        "fallback_available": False,
                    }

                # Parse available models
                models_data = res.json()
                available_models = [m.get("name", "") for m in models_data.get("models", [])]

                primary_available = any(
                    self.primary_model.lower() in m.lower()
                    for m in available_models
                )
                fallback_available = any(
                    self.fallback_model.lower() in m.lower()
                    for m in available_models
                )

                return {
                    "available": primary_available or fallback_available,
                    "ollama_running": True,
                    "primary_model": self.primary_model,
                    "primary_available": primary_available,
                    "fallback_model": self.fallback_model,
                    "fallback_available": fallback_available,
                    "available_models": available_models,
                    "error": None,
                }

        except Exception as e:
            logger.error(f"Error checking VLM availability: {e}")
            return {
                "available": False,
                "error": str(e),
                "ollama_running": False,
                "primary_model": self.primary_model,
                "primary_available": False,
                "fallback_model": self.fallback_model,
                "fallback_available": False,
            }

    async def analyze_document_with_vlm(
        self, image_bytes: bytes, prompt: str, model: Optional[str] = None
    ) -> VLMResponse:
        """Send image to local VLM for analysis.

        Args:
            image_bytes: Raw image bytes
            prompt: Text prompt for VLM analysis
            model: Optional model override (default: primary model)

        Returns:
            VLMResponse with analyzed text and structured data
        """
        if not self.enabled:
            return VLMResponse(
                success=False,
                model_used="",
                text="",
                error="VLM service disabled",
                confidence=0.0,
            )

        model_to_use = model or self.primary_model
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                payload = {
                    "model": model_to_use,
                    "prompt": prompt,
                    "images": [image_base64],
                    "stream": False,
                }

                logger.info(f"VLM analyze: {model_to_use} with prompt: {prompt[:50]}…")
                res = await client.post(
                    f"{self.ollama_url}/api/generate", json=payload
                )

                if res.status_code != 200:
                    logger.warning(
                        f"VLM {model_to_use} failed: {res.status_code}. Trying fallback…"
                    )
                    if model_to_use != self.fallback_model:
                        return await self.analyze_document_with_vlm(
                            image_bytes, prompt, self.fallback_model
                        )
                    return VLMResponse(
                        success=False,
                        model_used=model_to_use,
                        text="",
                        error=f"HTTP {res.status_code}",
                        confidence=0.0,
                    )

                response_data = res.json()
                output_text = response_data.get("response", "").strip()

                return VLMResponse(
                    success=True,
                    model_used=model_to_use,
                    text=output_text,
                    confidence=0.85,
                )

        except asyncio.TimeoutError:
            logger.warning(f"VLM {model_to_use} timeout. Trying fallback…")
            if model_to_use != self.fallback_model:
                return await self.analyze_document_with_vlm(
                    image_bytes, prompt, self.fallback_model
                )
            return VLMResponse(
                success=False,
                model_used=model_to_use,
                text="",
                error="Timeout after 30s",
                confidence=0.0,
            )
        except Exception as e:
            logger.error(f"VLM {model_to_use} error: {e}")
            if model_to_use != self.fallback_model:
                return await self.analyze_document_with_vlm(
                    image_bytes, prompt, self.fallback_model
                )
            return VLMResponse(
                success=False,
                model_used=model_to_use,
                text="",
                error=str(e),
                confidence=0.0,
            )

    async def extract_fields_with_vlm(
        self, image_bytes: bytes, form_type: str = "generic"
    ) -> List[FormField]:
        """Use VLM to extract form fields from ambiguous documents.

        Only called when OCR + layout doesn't produce clear field mappings.

        Args:
            image_bytes: Raw image bytes
            form_type: Type of form ("generic", "tax", "application", etc.)

        Returns:
            List of FormField objects with label, value, type, bbox, confidence
        """
        if not self.enabled:
            return []

        # Construct a specific prompt for field extraction
        if form_type == "tax":
            prompt = (
                "Analyze this tax form image. Extract all filled form fields. "
                "For each field, provide: field_name, filled_value, field_type (text/checkbox/signature). "
                "Output as JSON array: [{name, value, type}]"
            )
        elif form_type == "application":
            prompt = (
                "Analyze this application form. Extract all fields with their values. "
                "Include field labels and what the user entered. Output as JSON: [{label, value, type}]"
            )
        else:
            prompt = (
                "Analyze this form image and extract all visible form fields and their values. "
                "For each field, provide the label/question and the filled-in answer. "
                "Output as JSON array: [{label, value, field_type, confidence}]"
            )

        response = await self.analyze_document_with_vlm(image_bytes, prompt)
        if not response.success:
            logger.warning(f"Field extraction failed: {response.error}")
            return []

        # Parse VLM response as JSON
        try:
            response_text = response.text.strip()
            # Try to extract JSON from response (VLM might wrap it in text)
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0]
            elif "[" in response_text:
                json_str = response_text[response_text.find("[") : response_text.rfind("]") + 1]
            else:
                json_str = response_text

            fields_data = json.loads(json_str)
            if not isinstance(fields_data, list):
                fields_data = [fields_data]

            # Convert to FormField objects
            fields = []
            for item in fields_data:
                if isinstance(item, dict):
                    field = FormField(
                        label=item.get("label") or item.get("name") or item.get("field_name") or "",
                        value=item.get("value") or item.get("answer") or "",
                        field_type=item.get("field_type") or item.get("type") or "text",
                        confidence=float(item.get("confidence", 0.8)),
                    )
                    if field.label or field.value:
                        fields.append(field)

            logger.info(f"Extracted {len(fields)} fields from form")
            return fields

        except json.JSONDecodeError:
            logger.error(f"Failed to parse VLM JSON response: {response.text[:200]}")
            return []
        except Exception as e:
            logger.error(f"Error processing field extraction response: {e}")
            return []

    async def classify_document_with_vlm(
        self, image_bytes: bytes
    ) -> Dict[str, Any]:
        """Use VLM to classify document type when text-based detection fails.

        Args:
            image_bytes: Raw image bytes

        Returns:
            {
                "document_type": str,
                "confidence": float,
                "reasoning": str,
                "success": bool
            }
        """
        if not self.enabled:
            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reasoning": "VLM disabled",
                "success": False,
            }

        prompt = (
            "Classify this document type. What kind of form or document is this? "
            "(e.g., tax form, application, insurance claim, medical form, etc.) "
            "Respond with: {type: '...', confidence: 0.0-1.0, reason: '...'} as JSON."
        )

        response = await self.analyze_document_with_vlm(image_bytes, prompt)
        if not response.success:
            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reasoning": response.error or "VLM analysis failed",
                "success": False,
            }

        try:
            response_text = response.text.strip()
            # Extract JSON from response
            if "{" in response_text:
                json_str = response_text[response_text.find("{") : response_text.rfind("}") + 1]
            else:
                json_str = response_text

            classification = json.loads(json_str)
            return {
                "document_type": classification.get("type") or "unknown",
                "confidence": float(classification.get("confidence", 0.7)),
                "reasoning": classification.get("reason") or classification.get("reasoning") or "",
                "success": True,
            }
        except json.JSONDecodeError:
            logger.error(f"Failed to parse classification response: {response.text[:200]}")
            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reasoning": "Failed to parse VLM response",
                "success": False,
            }
        except Exception as e:
            logger.error(f"Error in document classification: {e}")
            return {
                "document_type": "unknown",
                "confidence": 0.0,
                "reasoning": str(e),
                "success": False,
            }


# Global service instance
vlm_service = VLMService()


async def check_vlm_available() -> Dict[str, Any]:
    """Check if VLM is available"""
    return await vlm_service.check_vlm_available()


async def analyze_document_with_vlm(
    image_bytes: bytes, prompt: str, model: Optional[str] = None
) -> VLMResponse:
    """Analyze document with VLM"""
    return await vlm_service.analyze_document_with_vlm(image_bytes, prompt, model)


async def extract_fields_with_vlm(
    image_bytes: bytes, form_type: str = "generic"
) -> List[FormField]:
    """Extract form fields with VLM"""
    return await vlm_service.extract_fields_with_vlm(image_bytes, form_type)


async def classify_document_with_vlm(image_bytes: bytes) -> Dict[str, Any]:
    """Classify document with VLM"""
    return await vlm_service.classify_document_with_vlm(image_bytes)
