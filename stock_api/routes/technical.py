"""
routes/technical.py  —  full replacement
"""

import numpy as np
import pandas as pd
from pathlib import Path
from fastapi import APIRouter
from utils.loader import get_technical_models
from utils.schemas import TechnicalRequest, TechnicalResponse, Signal

router = APIRouter(prefix="/predict", tags=["Technical"])

# ── Load last N rows of AAPL CSV once at import time ─────────────────────────
# This lets us compute lag/rolling features that need historical context.
_CSV_PATH = Path(__file__).resolve().parent.parent / "models" / "technical" / "aapl_raw.csv"

def _load_recent_history(n: int = 60) -> pd.DataFrame:
    """Return the last n rows of AAPL OHLCV, sorted oldest→newest."""
    if not _CSV_PATH.exists():
        raise FileNotFoundError(
            f"aapl_raw.csv not found at {_CSV_PATH}\n"
            "Copy it from your Colab workspace into models/technical/"
        )
    df = pd.read_csv(_CSV_PATH, parse_dates=["Date"])
    df = df.sort_values("Date").tail(n).reset_index(drop=True)
    return df

try:
    _history = _load_recent_history()
except FileNotFoundError as e:
    _history = None
    import logging
    logging.getLogger(__name__).warning(str(e))


def _build_feature_vector(req: TechnicalRequest, feature_names: list) -> np.ndarray:
    if _history is None:
        raise ValueError("aapl_raw.csv is missing from models/technical/.")

    today = pd.DataFrame([{
        "Date":   pd.Timestamp.today().normalize(),
        "Open":   req.current_price,
        "High":   req.day_high,
        "Low":    req.day_low,
        "Close":  req.current_price,
        "Volume": req.volume,
    }])
    df = pd.concat([_history, today], ignore_index=True)

    c = df["Close"]
    h = df["High"]
    l = df["Low"]
    v = df["Volume"]

    # ── Base features ──────────────────────────────────────
    df["Return"]     = c.pct_change()
    df["HL_Range"]   = h - l
    df["HL_Pct"]     = df["HL_Range"] / c
    df["Body_Pct"]   = (c - l) / (df["HL_Range"] + 1e-9)

    df["MA5"]        = c.rolling(5).mean()
    df["MA10"]       = c.rolling(10).mean()
    df["MA20"]       = c.rolling(20).mean()
    df["MA5_ratio"]  = c / (df["MA5"]  + 1e-9)
    df["MA10_ratio"] = c / (df["MA10"] + 1e-9)
    df["MA20_ratio"] = c / (df["MA20"] + 1e-9)

    df["Vol_MA5"]    = v.rolling(5).mean()
    df["Vol_ratio"]  = v / (df["Vol_MA5"] + 1e-9)

    delta = c.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    df["RSI"]        = 100 - (100 / (1 + gain / (loss + 1e-9)))

    df["Volatility"] = df["Return"].rolling(10).std()
    df["DayOfWeek"]  = pd.to_datetime(df["Date"]).dt.dayofweek

    # ── Auto-generate ALL Return_lagN and any other _lagN ──
    # Scans features.json and creates whatever lag number it finds
    import re
    for feat in feature_names:
        if feat not in df.columns:
            # Match patterns like Return_lag5, Close_lag10, Vol_lag3, etc.
            lag_match = re.match(r"^(.+)_lag(\d+)$", feat)
            if lag_match:
                base_col, lag_n = lag_match.group(1), int(lag_match.group(2))
                if base_col in df.columns:
                    df[feat] = df[base_col].shift(lag_n)
                else:
                    df[feat] = 0.0   # base column unknown, fill with 0
            else:
                df[feat] = 0.0       # unknown feature entirely, fill with 0

    df.loc[df.index[-1], "DayOfWeek"] = req.day_of_week
    last_row = df.iloc[-1]

    try:
        return np.array([[last_row[f] for f in feature_names]])
    except KeyError as e:
        available = [col for col in df.columns if col not in ["Date","Open","High","Low","Close","Volume"]]
        raise ValueError(f"Feature {e} still not found. Available: {available}")


@router.post("/technical", response_model=TechnicalResponse)
def predict_technical(req: TechnicalRequest):
    m = get_technical_models()

    clf      = m["classifier"]
    reg      = m["regressor"]
    features = m["features"]

    X = _build_feature_vector(req, features)

    proba   = clf.predict_proba(X)[0]
    classes = clf.classes_
    if hasattr(classes[0], "item"):
        classes = [c.item() for c in classes]

    IDX_TO_LABEL = {0: "SELL", 1: "HOLD", 2: "BUY"}
    prob_dict  = {IDX_TO_LABEL.get(c, str(c)): float(p) for c, p in zip(classes, proba)}
    pred_idx   = int(np.argmax(proba))
    signal     = Signal(IDX_TO_LABEL.get(classes[pred_idx], str(classes[pred_idx])))
    confidence = float(proba[pred_idx]) * 100

    price_target = None
    try:
        price_target = float(reg.predict(X)[0])
    except Exception:
        pass

    return TechnicalResponse(
        signal        = signal,
        confidence    = round(confidence, 2),
        probabilities = {k: round(v * 100, 2) for k, v in prob_dict.items()},
        price_target  = round(price_target, 2) if price_target else None,
        model_used    = "technical_classifier",
    )