"""
routes/sentiment.py
POST /predict/sentiment
"""

import numpy as np
import scipy.sparse as sp
from fastapi import APIRouter
from utils.loader import get_sentiment_models
from utils.schemas import SentimentRequest, SentimentResponse, SentimentLabel

router = APIRouter(prefix="/predict", tags=["Sentiment"])


@router.post("/sentiment", response_model=SentimentResponse)
def predict_sentiment(req: SentimentRequest):
    m = get_sentiment_models()

    clf       = m["classifier"]
    tfidf     = m["tfidf"]
    vader     = m["vader"]
    label_map = m["label_map"]

    text = req.text.strip()

    # ── VADER scores ─────────────────────────────────────────
    vader_scores: dict = vader.polarity_scores(text)

    # ── TF-IDF (195 features) ────────────────────────────────
    tfidf_vec = tfidf.transform([text])

    # ── 6 extra features → total 201 ────────────────────────
    extra = sp.csr_matrix([[
        vader_scores["neg"],
        vader_scores["neu"],
        vader_scores["pos"],
        vader_scores["compound"],
        len(text.split()),   # word count
        len(text),           # char count
    ]])
    X = sp.hstack([tfidf_vec, extra])

    # ── Predict ──────────────────────────────────────────────
    proba   = clf.predict_proba(X)[0]
    classes = clf.classes_

    IDX_TO_LABEL = {0: "BEARISH", 1: "NEUTRAL", 2: "BULLISH"}
    if hasattr(classes[0], "item"):
        classes = [c.item() for c in classes]

    prob_dict  = {IDX_TO_LABEL.get(c, str(c)): float(p) for c, p in zip(classes, proba)}
    pred_idx   = int(np.argmax(proba))
    pred_cls   = classes[pred_idx]
    label      = SentimentLabel(IDX_TO_LABEL.get(pred_cls, str(pred_cls)))
    confidence = float(proba[pred_idx]) * 100

    return SentimentResponse(
        label         = label,
        confidence    = round(confidence, 2),
        probabilities = {k: round(v * 100, 2) for k, v in prob_dict.items()},
        vader_scores  = {k: round(float(v), 4) for k, v in vader_scores.items()},
        model_used    = "sentiment_classifier",
    )