"""
utils/loader.py
Lazy singleton model loader.
Models are loaded from disk ONCE on first use, then cached in memory.
"""

import json
import joblib
import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Base paths ───────────────────────────────────────────────────────────────
BASE      = Path(__file__).resolve().parent.parent   # stock_api/
MODEL_DIR = BASE / "models"

TECH_DIR  = MODEL_DIR / "technical"
FUND_DIR  = MODEL_DIR / "fundamental"
SENT_DIR  = MODEL_DIR / "sentiment"


# ── Helper ───────────────────────────────────────────────────────────────────
def _load_pkl(path: Path):
    if not path.exists():
        raise FileNotFoundError(
            f"Model file not found: {path}\n"
            f"Copy the .pkl from your Colab workspace into: {path.parent}"
        )
    logger.info(f"Loading {path.name} …")
    return joblib.load(path)


def _load_json(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"JSON not found: {path}")
    with open(path) as f:
        return json.load(f)


# ── Technical models ─────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def get_technical_models() -> dict:
    return {
        "classifier":  _load_pkl(TECH_DIR / "model_classifier.pkl"),
        "regressor":   _load_pkl(TECH_DIR / "model_regressor.pkl"),
        "features":    _load_json(TECH_DIR / "features.json"),   # list[str]
    }


# ── Fundamental models ───────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def get_fundamental_models() -> dict:
    return {
        "classifier":    _load_pkl(FUND_DIR / "fundamental_rf.pkl"),
        "kmeans":        _load_pkl(FUND_DIR / "fundamental_kmeans.pkl"),
        "scaler":        _load_pkl(FUND_DIR / "fundamental_scaler.pkl"),
        "imputer":       _load_pkl(FUND_DIR / "fundamental_imputer.pkl"),
        "label_map":     _load_json(FUND_DIR / "fundamental_label_map.json"),
        "label_encoder": _load_json(FUND_DIR / "fundamental_label_encoder.json"),
        "features":      _load_json(FUND_DIR / "fundamental_features.json"),
    }


# ── Sentiment models ─────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def get_sentiment_models() -> dict:
    return {
        "classifier": _load_pkl(SENT_DIR / "sentiment_rf.pkl"),
        "tfidf":      _load_pkl(SENT_DIR / "sentiment_tfidf.pkl"),
        "vader":      _load_pkl(SENT_DIR / "sentiment_vader.pkl"),
        "label_map":  _load_json(SENT_DIR / "sentiment_label_map.json"),
    }


# ── Health check helper ──────────────────────────────────────────────────────
def check_models_loaded() -> dict[str, bool]:
    """Returns which model groups loaded successfully (non-raising)."""
    status = {}

    for name, loader in [
        ("technical",    get_technical_models),
        ("fundamental",  get_fundamental_models),
        ("sentiment",    get_sentiment_models),
    ]:
        try:
            loader()
            status[name] = True
        except Exception as e:
            logger.warning(f"{name} models unavailable: {e}")
            status[name] = False

    return status