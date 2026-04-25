"""
gemini_setup.py
---------------
Central Gemini AI configuration for Smart Plant Detection System.
Loads GEMINI_API_KEY from the .env file and exposes a ready-to-use
`model` object (gemini-1.5-flash) for chatbot and analytics routes.

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

# System prompt injected into every conversation
SYSTEM_INSTRUCTION = (
    "You are GreenSense AI - an expert intelligent agent embedded in a "
    "smart greenhouse monitoring dashboard. You have deep knowledge of "
    "plant science, soil chemistry, irrigation engineering, and data analytics. "
    "You help users understand their sensor data, navigate the dashboard, "
    "interpret charts and anomalies, and make smart farming decisions. "
    "Be concise, insightful, and actionable. Use bullet points and short "
    "paragraphs. If the user asks about a specific metric, always reference "
    "numbers from the dataset context provided."
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
        print("[gemini_setup] Gemini 1.5-flash client initialised successfully.")

except ImportError:
    print(
        "[gemini_setup] ERROR: 'google-genai' package not installed. "
        "Run: pip install google-genai"
    )
except Exception as exc:
    print(f"[gemini_setup] ERROR initialising Gemini: {exc}")
