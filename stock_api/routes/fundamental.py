"""
routes/fundamental.py
POST /predict/fundamental
"""

import time
import numpy as np
import pandas as pd
from fastapi import APIRouter
from utils.loader import get_fundamental_models
from utils.schemas import FundamentalRequest, FundamentalResponse, Signal

router = APIRouter(prefix="/predict", tags=["Fundamental"])

FEATURE_ORDER = [
    "PE_Ratio", "PB_Ratio", "EPS",
    "RevenueGrowth", "MarketCap", "ROE",
]


def _apply_log_transforms(arr: np.ndarray) -> np.ndarray:
    arr = arr.copy().astype(float)
    arr[:, 0] = np.log1p(np.clip(arr[:, 0], 0, None))
    arr[:, 1] = np.log1p(np.clip(arr[:, 1], 0.01, None))
    arr[:, 4] = np.log1p(arr[:, 4])
    return arr


@router.post("/fundamental", response_model=FundamentalResponse)
def predict_fundamental(req: FundamentalRequest):
    m = get_fundamental_models()

    imputer   = m["imputer"]
    scaler    = m["scaler"]
    kmeans    = m["kmeans"]
    clf       = m["classifier"]
    label_map = m["label_map"]

    raw = np.array([[
        req.pe_ratio, req.pb_ratio, req.eps,
        req.revenue_growth, req.market_cap, req.roe,
    ]])

    # ── Start inference timer ────────────────────────────────
    inference_start = time.perf_counter()

    X          = imputer.transform(raw)
    X          = _apply_log_transforms(X)
    X_scaled   = scaler.transform(X)
    cluster_id = int(kmeans.predict(X_scaled)[0])

    X_scaled_df = pd.DataFrame(X_scaled, columns=FEATURE_ORDER)
    proba       = clf.predict_proba(X_scaled_df)[0]

    # ── Stop inference timer ─────────────────────────────────
    inference_ms = (time.perf_counter() - inference_start) * 1000

    classes = clf.classes_
    IDX_TO_LABEL = {0: "SELL", 1: "HOLD", 2: "BUY"}
    if hasattr(classes[0], "item"):
        classes = [c.item() for c in classes]

    prob_dict     = {IDX_TO_LABEL.get(c, str(c)): float(p) for c, p in zip(classes, proba)}
    pred_idx      = int(np.argmax(proba))
    pred_cls      = classes[pred_idx]
    signal        = Signal(IDX_TO_LABEL.get(pred_cls, str(pred_cls)))
    confidence    = float(proba[pred_idx]) * 100
    cluster_label = label_map.get(str(cluster_id), f"Cluster {cluster_id}")

    return FundamentalResponse(
        signal        = signal,
        confidence    = round(confidence, 2),
        probabilities = {k: round(v * 100, 2) for k, v in prob_dict.items()},
        cluster_id    = cluster_id,
        cluster_label = cluster_label,
        model_used    = "fundamental_classifier",
        inference_ms  = round(inference_ms, 2),
    )
