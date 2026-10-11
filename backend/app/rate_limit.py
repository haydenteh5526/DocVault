"""Shared rate limiter instance.

Defined in its own module so both `main.py` and individual routers can import
the same `Limiter` without creating a circular import (main imports routers).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
