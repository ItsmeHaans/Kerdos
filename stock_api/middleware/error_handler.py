"""
middleware/error_handler.py
Global exception handler — returns clean JSON for every error.
"""

import logging
import traceback
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    tb = traceback.format_exc()
    logger.error(f"Unhandled exception on {request.url}:\n{tb}")

    # FileNotFoundError → 503  (model file missing)
    if isinstance(exc, FileNotFoundError):
        return JSONResponse(
            status_code=503,
            content={
                "error": "model_unavailable",
                "detail": str(exc),
                "hint": "Make sure all .pkl files are placed in the correct models/ subfolder.",
            },
        )

    # ValueError / validation issues → 422
    if isinstance(exc, (ValueError, KeyError)):
        return JSONResponse(
            status_code=422,
            content={
                "error": "prediction_error",
                "detail": str(exc),
            },
        )

    # Everything else → 500
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "detail": "An unexpected error occurred. Check server logs for details.",
        },
    )