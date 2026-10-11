from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.config import _INSECURE_JWT_SECRETS, settings
from app.logging_config import configure_logging, get_logger, new_request_id, request_id_var
from app.rate_limit import limiter
from app.routers import ai, auth, categories, conversations, documents, notifications, search, tags, warranties

configure_logging()
logger = get_logger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.storage_service import ensure_bucket_exists

    if settings.JWT_SECRET in _INSECURE_JWT_SECRETS:
        logger.warning(
            "JWT_SECRET is set to the insecure default. Set a strong random "
            "JWT_SECRET in the environment before deploying to production."
        )
    from app.services.embedding_service import _select_provider
    logger.info("Embedding provider: %s (EMBEDDING_PROVIDER=%s)", _select_provider(), settings.EMBEDDING_PROVIDER)
    try:
        ensure_bucket_exists()
        logger.info("Storage bucket ready")
    except Exception as e:  # noqa: BLE001
        logger.error("Failed to ensure bucket: %s", e)
    yield


app = FastAPI(
    title="AI Cloud Document Vault",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    import time

    from app.metrics import REQUEST_COUNT, REQUEST_LATENCY
    rid = request.headers.get("X-Request-ID") or new_request_id()
    request_id_var.set(rid)
    logger.info("%s %s", request.method, request.url.path)
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    # Use route template where possible to avoid high-cardinality paths
    path = request.scope.get("route").path if request.scope.get("route") else request.url.path
    REQUEST_COUNT.labels(request.method, path, response.status_code).inc()
    REQUEST_LATENCY.labels(request.method, path).observe(elapsed)
    response.headers["X-Request-ID"] = rid
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Attach hardening headers to every response.

    CSP is intentionally omitted so the Swagger UI at /docs keeps working; the
    headers below are safe for a JSON API and a same-origin SPA. HSTS only takes
    effect over HTTPS (ignored on plain HTTP), so it's harmless locally.
    """
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
    response.headers.setdefault(
        "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
    )
    return response


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": {"code": "RATE_LIMITED", "message": "Too many requests."}})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(categories.router, prefix="/api/v1/categories", tags=["categories"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(warranties.router, prefix="/api/v1/warranties", tags=["warranties"])
app.include_router(tags.router, prefix="/api/v1/tags", tags=["tags"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(conversations.router, prefix="/api/v1/conversations", tags=["conversations"])


@app.get("/health")
async def health():
    """Liveness probe — fast, no dependencies."""
    return {"status": "ok"}


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    from fastapi.responses import Response
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/health/ready")
async def health_ready():
    """Readiness probe — checks DB, S3, and AI provider connectivity."""
    from app.dependencies import async_session
    from app.services.storage_service import get_s3_client

    checks: dict[str, str] = {}
    healthy = True

    # Database
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:  # noqa: BLE001
        checks["database"] = f"error: {type(e).__name__}"
        healthy = False

    # S3 / MinIO
    try:
        get_s3_client().head_bucket(Bucket=settings.S3_BUCKET)
        checks["storage"] = "ok"
    except Exception as e:  # noqa: BLE001
        checks["storage"] = f"error: {type(e).__name__}"
        healthy = False

    # AI provider (config presence only — no network call)
    from app.services.embedding_service import _select_provider
    checks["ai"] = f"embeddings:{_select_provider()}"

    # Redis cache (optional — does not affect overall health)
    if settings.REDIS_URL:
        try:
            import redis as _redis_lib
            _redis_lib.from_url(settings.REDIS_URL, socket_connect_timeout=2).ping()
            checks["cache"] = "ok"
        except Exception as e:  # noqa: BLE001
            checks["cache"] = f"unavailable: {type(e).__name__}"
    else:
        checks["cache"] = "in-memory"

    status_code = 200 if healthy else 503
    return JSONResponse(status_code=status_code, content={"status": "ready" if healthy else "degraded", "checks": checks})
