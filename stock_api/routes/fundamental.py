"""
routes/fundamental.py
POST /predict/fundamental

Inputs  : pe_ratio, pb_ratio, eps, revenue_growth, market_cap, roe
Outputs : signal (BUY/HOLD/SELL), confidence, probabilities, cluster_label

Pipeline (mirrors your Colab notebook):
  raw input → imputer → log-transform → scaler → kmeans cluster → RF classifier
"""

import numpy as np
import json
from fastapi import APIRouter
import pandas as pd
from utils.loader import get_fundamental_models
from utils.schemas import FundamentalRequest, FundamentalResponse, Signal

router = APIRouter(prefix="/predict", tags=["Fundamental"])

# Must match CLUSTER_FEATURES order in your notebook
FEATURE_ORDER = [
    "PE_Ratio",
    "PB_Ratio",
    "EPS",
    "RevenueGrowth",
    "MarketCap",
    "ROE",
]


def _apply_log_transforms(arr: np.ndarray) -> np.ndarray:
    """
    Mirrors Block 2 log transforms.
    arr columns: [PE_Ratio, PB_Ratio, EPS, RevenueGrowth, MarketCap, ROE]
    """
    arr = arr.copy().astype(float)
    # col 0: PE_Ratio  → log1p
    arr[:, 0] = np.log1p(np.clip(arr[:, 0], 0, None))
    # col 1: PB_Ratio  → log1p(clip 0.01)
    arr[:, 1] = np.log1p(np.clip(arr[:, 1], 0.01, None))
    # col 4: MarketCap → log1p (stored in Billions, transform as-is)
    arr[:, 4] = np.log1p(arr[:, 4])
    return arr


@router.post("/fundamental", response_model=FundamentalResponse)
def predict_fundamental(req: FundamentalRequest):
    m = get_fundamental_models()

    imputer   = m["imputer"]
    scaler    = m["scaler"]
    kmeans    = m["kmeans"]
    clf       = m["classifier"]
    label_map = m["label_map"]        # e.g. {"0": "Value", "1": "Growth", ...}

    # ── Build raw array (same column order as training) ──────
    raw = np.array([[
        req.pe_ratio,
        req.pb_ratio,
        req.eps,
        req.revenue_growth,
        req.market_cap,
        req.roe,
    ]])

    # ── Impute (handles any NaN — not expected from API but safe) ──
    X = imputer.transform(raw)

    # ── Log transforms ───────────────────────────────────────
    X = _apply_log_transforms(X)

    # ── Scale ────────────────────────────────────────────────
    X_scaled = scaler.transform(X)

    # ── KMeans cluster ───────────────────────────────────────
    cluster_id    = int(kmeans.predict(X_scaled)[0])
    cluster_label = label_map.get(str(cluster_id), f"Cluster {cluster_id}")

    # ── RF Classification ────────────────────────────────────
    # Append cluster_id as extra feature if your RF was trained with it
    X_clf = X_scaled

    # After scaler.transform, wrap with DataFrame using FEATURE_ORDER as columns:
    X_scaled_df = pd.DataFrame(X_scaled, columns=FEATURE_ORDER)

    # Then use X_scaled_df instead of X_scaled when calling clf.predict_proba:
    proba = clf.predict_proba(X_scaled_df)[0]
    classes = clf.classes_

    IDX_TO_LABEL = {0: "SELL", 1: "HOLD", 2: "BUY"}
    if hasattr(classes[0], "item"):
        classes = [c.item() for c in classes]

    prob_dict  = {IDX_TO_LABEL.get(c, str(c)): float(p) for c, p in zip(classes, proba)}
    pred_idx   = int(np.argmax(proba))
    pred_cls   = classes[pred_idx]
    signal     = Signal(IDX_TO_LABEL.get(pred_cls, str(pred_cls)))
    confidence = float(proba[pred_idx]) * 100

    return FundamentalResponse(
        signal        = signal,
        confidence    = round(confidence, 2),
        probabilities = {k: round(v * 100, 2) for k, v in prob_dict.items()},
        cluster_id    = cluster_id,
        cluster_label = cluster_label,
        model_used    = "fundamental_classifier",
    )