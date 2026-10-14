# Multi-stage build for PdfEzFill OCR Service
FROM python:3.11-slim as builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    build-essential \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel && \
    pip install -r requirements.txt && \
    pip install commonforms ultralytics
# Note: commonforms pulls YOLO11 dependencies (~1.2GB download)
# and ultralytics adds YOLOv8 fallback support for checkbox detection

# Final runtime stage
FROM python:3.11-slim

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    libsm6 \
    libxext6 \
    libxrender-dev \
    tesseract-ocr \
    libopencv-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    OCR_HOST=0.0.0.0 \
    OCR_PORT=5050 \
    OCR_MODEL=tesseract \
    DEVICE=cpu

# Create app directory
WORKDIR /app

# Copy application code
COPY ocr_service.py .
COPY preprocess.py .
COPY vlm_service.py .
COPY field_detector.py .

# Pre-download CommonForms FFDNet model weights for faster cold start
RUN python -c "from commonforms import prepare_form; print('CommonForms models cached')" || true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:5050/health', timeout=5.0)" || exit 1

# Expose port
EXPOSE 5050

# Run FastAPI application
CMD ["uvicorn", "ocr_service:app", "--host", "0.0.0.0", "--port", "5050", "--workers", "1"]
