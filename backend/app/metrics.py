from prometheus_client import Counter, Histogram

REQUEST_COUNT = Counter(
    "docvault_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)

REQUEST_LATENCY = Histogram(
    "docvault_request_latency_seconds",
    "HTTP request latency",
    ["method", "path"],
)

OCR_DURATION = Histogram(
    "docvault_ocr_duration_seconds",
    "OCR extraction duration",
)

EMBEDDING_DURATION = Histogram(
    "docvault_embedding_duration_seconds",
    "Embedding generation duration",
)
