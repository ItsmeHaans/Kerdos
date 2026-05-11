# routes/health.py
from fastapi import APIRouter
from utils.loader import check_models_loaded
from utils.schemas import HealthResponse

router = APIRouter(tags=["Health"])   # ← was missing, causing the AttributeError

@router.get("/health", response_model=HealthResponse)
def health():
    loaded = check_models_loaded()
    all_ok = all(loaded.values())
    return HealthResponse(
        status        = "ok" if all_ok else "degraded",
        models_loaded = loaded,
    )