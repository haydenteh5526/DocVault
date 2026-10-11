"""Optional LLM observability via Langfuse.

Entirely optional and fail-safe: if the langfuse package isn't installed or the
keys aren't configured, every helper here becomes a no-op. Nothing in the RAG
path should ever break because tracing is unavailable.
"""
from contextlib import contextmanager

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("observability")

_client = None
_initialised = False


def _get_client():
    """Lazily build the Langfuse client once, if keys are present and the
    package is importable. Returns None when tracing is disabled."""
    global _client, _initialised
    if _initialised:
        return _client
    _initialised = True

    if not (settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY):
        return None
    try:
        from langfuse import Langfuse

        _client = Langfuse(
            public_key=settings.LANGFUSE_PUBLIC_KEY,
            secret_key=settings.LANGFUSE_SECRET_KEY,
            host=settings.LANGFUSE_HOST,
        )
        logger.info("Langfuse tracing enabled")
    except Exception as e:  # noqa: BLE001 — tracing must never break the app
        logger.warning("Langfuse unavailable (%s); tracing disabled", type(e).__name__)
        _client = None
    return _client


def is_enabled() -> bool:
    return _get_client() is not None


@contextmanager
def trace_generation(name: str, model: str, input_text: str, metadata: dict | None = None):
    """Context manager that records an LLM generation as a Langfuse trace.

    Yields a callable `record_output(text)` to attach the model output. When
    tracing is disabled this is a transparent no-op, so callers need no
    conditional logic.
    """
    client = _get_client()
    if client is None:
        yield lambda _output=None: None
        return

    output_holder: dict = {}

    def record_output(text=None):
        output_holder["output"] = text

    try:
        yield record_output
    finally:
        try:
            trace = client.trace(name=name, input=input_text, metadata=metadata or {})
            trace.generation(
                name=name,
                model=model,
                input=input_text,
                output=output_holder.get("output"),
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("Langfuse trace failed (%s)", type(e).__name__)
