# 🪙 Kerdos - Your Personal AI Trader

> **Educational use only. Not financial advice.**

Kerdos is an end-to-end 3-model Machine Learning system for stock analysis, built as a final project for COMP6577001 - Machine Learning at BINUS University.

🔗 **Live App:** [https://kerdos-puce.vercel.app/](https://kerdos-puce.vercel.app/)

---

## 👥 Team

| Name | Role |
|------|------|
| Hans Ewaldo Kristiawan | Machine Learning Engineer & Backend Developer |
| Christian Verrell | Machine Learning Engineer & Data Engineer |
| Adrian Marcello Budiman | Machine Learning Engineer & Frontend Developer |

---

## 🧠 Models

| Model | Task | Algorithm | Output |
|-------|------|-----------|--------|
| **Technical** | Predict tomorrow's trading signal | XGBoost Classifier + RF Regressor | BUY / HOLD / SELL |
| **Fundamental** | Classify stock valuation | KMeans Clustering + RF Classifier | Undervalued / Fair / Overvalued |
| **Sentiment** | Classify market sentiment from news | TF-IDF + VADER + RF Classifier | Fear / Neutral / Greed |

---

## 📁 Project Structure

```
kerdos/
├── notebooks/          # Jupyter notebooks for EDA, training, evaluation
├── stock_api/          # FastAPI backend
│   └── main.py         # Main API entry point
├── models/             # Trained .pkl model files
├── requirements.txt    # Python dependencies
└── README.md
```

---

## 🚀 Running Locally

### 1. Create and activate virtual environment (from root)

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Mac/Linux
python -m venv venv
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the FastAPI backend

```bash
cd stock_api
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

API docs (Swagger): `http://localhost:8000/docs`

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/predict/technical` | Technical analysis signal |
| POST | `/predict/fundamental` | Fundamental valuation |
| POST | `/predict/sentiment` | Sentiment classification |

---

## 📊 Model Performance

| Model | Key Metric | Value | Latency |
|-------|-----------|-------|---------|
| Technical | ROC-AUC | 0.5232 | 88ms |
| Fundamental | Balanced Accuracy | 0.9457 | 65ms |
| Sentiment | Macro F1 | 0.65 | 89ms |

All models meet the **<100ms inference latency** requirement.

---

## 🛠️ Tech Stack

- **Backend:** Python, FastAPI
- **ML Libraries:** scikit-learn, XGBoost, NLTK (VADER), pandas, numpy
- **Frontend:** HTML, CSS, JavaScript
- **Deployment:** Vercel (frontend) + Railway (backend)

---

## ⚠️ Disclaimer

This application is built for **educational purposes only** as part of a university Machine Learning course. It does not constitute financial advice. Always consult a qualified financial advisor before making investment decisions.
