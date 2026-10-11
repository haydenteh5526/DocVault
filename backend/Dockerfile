FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as an unprivileged user rather than root.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Container-level liveness check (uses the app's /health endpoint).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

# Production command — no --reload. Local hot-reload is provided by the
# docker-compose `command:` override on the api service.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
