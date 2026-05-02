"""
gemini_setup.py
---------------
Central Gemini AI configuration for Smart Plant Detection System.
Loads GEMINI_API_KEY from the .env file and exposes a ready-to-use
`client` object for chatbot and analytics routes.

Uses the modern google-genai SDK (google.genai) — NOT the deprecated
google.generativeai package.

Usage:
    from gemini_setup import client, MODEL_NAME, gemini_available
"""

import os
import sys
from pathlib import Path

# ── Safe printing on Windows (avoid charmap codec errors with Unicode) ────────
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── Load environment variables from .env ─────────────────────────────────────
from dotenv import load_dotenv

# Walk up to find the .env (handles running from backend/ or project root)
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)
else:
    load_dotenv()  # Fallback: search CWD and parent dirs

# ── Read API key ───────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Model to use — gemini-1.5-flash is:
#   • Very fast (~1-2s response times)
#   • 1M token context window (no risk of overflow with compact summaries)
#   • Free-tier friendly
MODEL_NAME = "gemini-1.5-flash"

# ── System prompt injected into every conversation ────────────────────────────
SYSTEM_INSTRUCTION = (
    "You are GreenSense AI — an expert intelligent agent embedded in a smart greenhouse "
    "monitoring and analytics dashboard powered by React, Firebase, and machine learning.\n\n"

    "Your knowledge base includes:\n"
    "  • The TARP greenhouse dataset (100,000+ historical sensor records with soil moisture, "
    "temperature, humidity, NPK nutrients, pH, rainfall, and pump Status ON/OFF)\n"
    "  • Live real-time sensor data from a Firebase Realtime Database (soil moisture, "
    "air temperature, air humidity, light intensity, pump, fan)\n"
    "  • ML analytics: Isolation Forest anomaly detection, Linear Regression forecasting, "
    "Pearson correlation matrix, and Random Forest feature importance for pump control\n"
    "  • The dashboard structure: Overview, Soil Moisture, Temperature, Humidity, Light "
    "Intensity, AI Analytics, History Logs, Alerts, Settings, and this Chatbot\n\n"

    "Your role is to:\n"
    "  1. Answer natural language questions about sensor readings, trends, and dataset statistics\n"
    "  2. Guide users to the correct dashboard page or feature\n"
    "  3. Explain ML model outputs (anomalies, forecasts, feature importance, correlation)\n"
    "  4. Support decision-oriented questions like 'should I water now?' or 'what factors "
    "influence pump activation?'\n"
    "  5. Identify and explain visual trends, comparisons, and anomalies\n\n"

    "Communication guidelines:\n"
    "  • Be concise, insightful, and data-driven — always cite specific numbers\n"
    "  • Use **bold** for key terms and values using markdown\n"
    "  • Use bullet points (•) for lists and structured information\n"
    "  • Always end with a concrete, actionable recommendation when relevant\n"
    "  • When live data and historical data differ, note both and explain the discrepancy\n"
    "  • If you detect a concerning pattern in the live data, proactively warn the user\n"
    "  • Avoid jargon — explain ML concepts simply (e.g., 'Isolation Forest marks readings "
    "that are statistically unusual')\n"
)

# ── Initialise Gemini client ──────────────────────────────────────────────────
client = None
gemini_available = False

try:
    from google import genai  # type: ignore
    from google.genai import types  # type: ignore

    if not GEMINI_API_KEY:
        print("[gemini_setup] WARNING: GEMINI_API_KEY not set in .env - chatbot disabled.")
    else:
        client = genai.Client(api_key=GEMINI_API_KEY)
        gemini_available = True
        print(f"[gemini_setup] ✅ Gemini client initialised successfully (model: {MODEL_NAME}).")

except ImportError:
    print(
        "[gemini_setup] ERROR: 'google-genai' package not installed. "
        "Run: pip install google-genai"
    )
except Exception as exc:
    print(f"[gemini_setup] ERROR initialising Gemini: {exc}")
