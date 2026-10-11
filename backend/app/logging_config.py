import logging
import sys
import uuid
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s | %(levelname)-7s | req=%(request_id)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    ))
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
