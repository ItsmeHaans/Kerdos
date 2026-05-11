"""
utils/schemas.py
Pydantic v2 request & response models for all 3 prediction endpoints.
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Literal, Optional
from enum import Enum


# ─────────────────────────────── Shared ─────────────────────────────────────

class Signal(str, Enum):
    BUY  = "BUY"
    HOLD = "HOLD"
    SELL = "SELL"


class BaseResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    signal:     Signal
    confidence: float = Field(..., ge=0.0, le=100.0, description="Confidence % (0–100)")
    probabilities: dict[str, float]  # {"BUY": 0.6, "HOLD": 0.3, "SELL": 0.1}


# ──────────────────────────── Technical ─────────────────────────────────────

class DayOfWeek(int, Enum):
    Monday    = 0
    Tuesday   = 1
    Wednesday = 2
    Thursday  = 3
    Friday    = 4


class TechnicalRequest(BaseModel):
    day_high:      float = Field(..., gt=0,   example=150.0,    description="Day high price ($)")
    day_low:       float = Field(..., gt=0,   example=145.0,    description="Day low price ($)")
    current_price: float = Field(..., gt=0,   example=148.0,    description="Current / close price ($)")
    volume:        float = Field(..., gt=0,   example=80_000_000, description="Trading volume")
    day_of_week:   int   = Field(..., ge=0, le=5, example=2,   description="0=Mon … 4=Fri")

    @field_validator("current_price")
    @classmethod
    def price_within_range(cls, v, info):
        data = info.data
        if "day_low" in data and v < data["day_low"]:
            raise ValueError("current_price must be >= day_low")
        if "day_high" in data and v > data["day_high"]:
            raise ValueError("current_price must be <= day_high")
        return v


class TechnicalResponse(BaseResponse):
    model_config = ConfigDict(protected_namespaces=())
    price_target:    Optional[float] = Field(None, description="Predicted price target from regressor")
    cluster_label:   Optional[str]   = None
    model_used:      str             = "technical_classifier"


# ──────────────────────────── Fundamental ───────────────────────────────────

class FundamentalRequest(BaseModel):
    pe_ratio:       float = Field(..., gt=0,              example=25.0,  description="P/E Ratio (trailing, positive only)")
    pb_ratio:       float = Field(..., gt=0,              example=3.0,   description="P/B Ratio")
    eps:            float = Field(...,                    example=5.0,   description="Earnings Per Share ($)")
    revenue_growth: float = Field(...,                    example=0.10,  description="Revenue growth (0.10 = 10%)")
    market_cap:     float = Field(..., gt=0,              example=100.0, description="Market Cap in Billions $")
    roe:            float = Field(...,                    example=0.15,  description="Return on Equity (0.15 = 15%)")


class FundamentalResponse(BaseResponse):
    model_config = ConfigDict(protected_namespaces=())
    cluster_id:    int
    cluster_label: str   = Field(..., description="e.g. 'Value', 'Growth', 'Speculative'")
    model_used:    str   = "fundamental_classifier"


# ──────────────────────────── Sentiment ─────────────────────────────────────

class SentimentRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=5,
        max_length=5000,
        example="Apple reported record earnings, beating analyst expectations by 15%.",
        description="Financial news, headline, or commentary to analyze",
    )


class SentimentLabel(str, Enum):
    BULLISH = "BULLISH"
    NEUTRAL = "NEUTRAL"
    BEARISH = "BEARISH"


class SentimentResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    label:       SentimentLabel
    confidence:  float = Field(..., ge=0.0, le=100.0)
    probabilities: dict[str, float]
    vader_scores: dict[str, float] = Field(
        ..., description="Raw VADER scores: neg, neu, pos, compound"
    )
    model_used:  str = "sentiment_classifier"


# ──────────────────────────── Health ────────────────────────────────────────

class HealthResponse(BaseModel):
    status:         str
    models_loaded:  dict[str, bool]
    version:        str = "1.0.0"