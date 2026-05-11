"""
main.py  —  Stock Analysis API entry point
Run: uvicorn main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
# main.py — add at the very top, before all other imports
import warnings
from sklearn.exceptions import InconsistentVersionWarning
warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from middleware.error_handler import global_exception_handler
from routes import health, technical, fundamental, sentiment
from utils.loader import check_models_loaded

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ── Startup / shutdown ───────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting Stock Analysis API …")
    status = check_models_loaded()
    for name, ok in status.items():
        icon = "✅" if ok else "⚠️ "
        logger.info(f"  {icon} {name} models: {'loaded' if ok else 'MISSING — place .pkl files in models/'}")
    yield
    logger.info("👋 Shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "Stock Analysis API",
    description = (
        "Three-model stock analysis pipeline:\n"
        "- **Technical**: price signals from OHLCV data\n"
        "- **Fundamental**: valuation signals from financial ratios\n"
        "- **Sentiment**: news/commentary → Bullish / Neutral / Bearish\n\n"
        "> ⚠️ Educational use only. Not financial advice."
    ),
    version     = "1.0.0",
    lifespan    = lifespan,
)

# ── CORS (allow all origins for local dev — restrict in prod) ─────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Global error handler ──────────────────────────────────────────────────────
app.add_exception_handler(Exception, global_exception_handler)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(technical.router)
app.include_router(fundamental.router)
app.include_router(sentiment.router)


# ── Root ──────────────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
def root():
    return {
        "message": "Stock Analysis API is running 🚀",
        "docs":    "/docs",
        "health":  "/health",
        "routes": {
            "technical":   "POST /predict/technical",
            "fundamental": "POST /predict/fundamental",
            "sentiment":   "POST /predict/sentiment",
        },
    }