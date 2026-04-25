"""
chatbot_routes.py
-----------------
Flask blueprint powering the GreenSense AI chatbot.

Strategy for handling the 100,000-row TARP.csv without overloading the LLM:
  1. Load the CSV ONCE at startup using pandas.
  2. Pre-compute a rich statistical profile (≈ 1,500 tokens).
  3. At chat time, append the current live sensor context (≈ 200 tokens).
  4. Send only this compact summary — never raw rows — to Gemini.

Endpoints:
  GET  /api/chat/context  → returns the pre-computed dataset summary (debug/UI)
  POST /api/chat          → accepts {message, live_data, active_page} → LLM answer
"""

import json
import traceback
from pathlib import Path

import numpy as np
import pandas as pd
from flask import Blueprint, jsonify, request

# Import shared Gemini client from dedicated setup file
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from gemini_setup import client, MODEL_NAME, SYSTEM_INSTRUCTION, gemini_available

chatbot_bp = Blueprint("chatbot_bp", __name__)

# ── STEP 1: Load & summarise TARP.csv at startup ─────────────────────────────

DATASET_PATH = Path(__file__).resolve().parent.parent.parent / "dataset" / "TARP.csv"

_dataset_summary = {}   # holds the pre-computed context dict
_summary_text = ""      # ready-to-inject string for Gemini prompts


def _build_dataset_summary():
    """Load TARP.csv and compute a compact, LLM-friendly statistical profile."""
    global _dataset_summary, _summary_text

    if not DATASET_PATH.exists():
        _summary_text = "TARP.csv dataset not found."
        print(f"[chatbot_routes] WARNING: {DATASET_PATH} not found.")
        return

    try:
        print("[chatbot_routes] Loading TARP.csv …")
        df = pd.read_csv(DATASET_PATH)
        df.columns = df.columns.str.strip()   # remove accidental leading spaces
        print(f"[chatbot_routes] Dataset loaded: {df.shape[0]:,} rows × {df.shape[1]} cols")

        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        cat_cols     = df.select_dtypes(include=["object"]).columns.tolist()

        # ── Basic overview ──────────────────────────────────────────────────
        overview = {
            "total_rows": int(df.shape[0]),
            "total_columns": int(df.shape[1]),
            "columns": df.columns.tolist(),
            "numeric_columns": numeric_cols,
            "categorical_columns": cat_cols,
            "null_counts": df.isnull().sum().to_dict(),
        }

        # ── Per-column statistics ───────────────────────────────────────────
        stats = {}
        for col in numeric_cols:
            s = df[col].dropna()
            if len(s) == 0:
                continue
            stats[col] = {
                "count": int(s.count()),
                "mean": round(float(s.mean()), 3),
                "std": round(float(s.std()), 3),
                "min": round(float(s.min()), 3),
                "max": round(float(s.max()), 3),
                "q25": round(float(s.quantile(0.25)), 3),
                "median": round(float(s.median()), 3),
                "q75": round(float(s.quantile(0.75)), 3),
            }

        # ── Status (pump) distribution ──────────────────────────────────────
        status_dist = {}
        if "Status" in df.columns:
            vc = df["Status"].value_counts()
            total = vc.sum()
            for val, cnt in vc.items():
                status_dist[str(val)] = {
                    "count": int(cnt),
                    "pct": round(float(cnt / total * 100), 2),
                }

        # ── Conditional means: Status ON vs OFF ────────────────────────────
        conditional_means = {}
        if "Status" in df.columns:
            for grp in df["Status"].dropna().unique():
                sub = df[df["Status"] == grp][numeric_cols].mean().round(2)
                conditional_means[str(grp)] = sub.dropna().to_dict()

        # ── Correlation with Status (numeric encode) ────────────────────────
        status_corr = {}
        if "Status" in df.columns:
            df_enc = df.copy()
            df_enc["Status_num"] = (df_enc["Status"].str.strip() == "ON").astype(int)
            for col in numeric_cols:
                if df_enc[col].dropna().shape[0] > 100:
                    corr_val = df_enc[[col, "Status_num"]].dropna().corr().iloc[0, 1]
                    if not np.isnan(corr_val):
                        status_corr[col] = round(float(corr_val), 3)
            status_corr = dict(
                sorted(status_corr.items(), key=lambda x: abs(x[1]), reverse=True)
            )

        # ── Top 3 most-correlated features with pump Status ─────────────────
        top_factors = list(status_corr.items())[:5]

        # ── Threshold-based rules (derived empirically) ─────────────────────
        threshold_rules = []
        if "Status" in df.columns and "Soil Moisture" in df.columns:
            df_enc2 = df.copy()
            df_enc2["Status_num"] = (df_enc2["Status"].str.strip() == "ON").astype(int)
            for col in ["Soil Moisture", "Temperature", "Soil Humidity"]:
                if col not in df_enc2.columns:
                    continue
                s = df_enc2[col].dropna()
                low_mask  = df_enc2[col] <= s.quantile(0.33)
                high_mask = df_enc2[col] >= s.quantile(0.67)
                low_on_pct  = df_enc2.loc[low_mask,  "Status_num"].mean() * 100
                high_on_pct = df_enc2.loc[high_mask, "Status_num"].mean() * 100
                threshold_rules.append(
                    f"When {col} is LOW (≤{s.quantile(0.33):.0f}), pump is ON {low_on_pct:.1f}% of the time. "
                    f"When {col} is HIGH (≥{s.quantile(0.67):.0f}), pump is ON {high_on_pct:.1f}% of the time."
                )

        # ── Assemble the full summary ───────────────────────────────────────
        _dataset_summary = {
            "overview": overview,
            "statistics": stats,
            "status_distribution": status_dist,
            "conditional_means_by_status": conditional_means,
            "correlation_with_pump_status": status_corr,
            "top_influencing_factors": top_factors,
            "threshold_rules": threshold_rules,
        }

        # ── Build plain-text context string for Gemini ──────────────────────
        lines = [
            "=== TARP GREENHOUSE DATASET CONTEXT ===",
            f"Dataset: {overview['total_rows']:,} records, {overview['total_columns']} features",
            f"Columns: {', '.join(overview['columns'])}",
            "",
            "--- PUMP STATUS DISTRIBUTION ---",
        ]
        for status, info in status_dist.items():
            lines.append(f"  {status}: {info['count']:,} records ({info['pct']}%)")

        lines += ["", "--- PER-FEATURE STATISTICS (mean / std / min–max) ---"]
        for col, s in stats.items():
            lines.append(
                f"  {col}: mean={s['mean']}, std={s['std']}, range=[{s['min']} – {s['max']}], median={s['median']}"
            )

        lines += ["", "--- TOP FACTORS INFLUENCING PUMP STATUS (correlation) ---"]
        for col, corr in top_factors:
            direction = "positive" if corr > 0 else "negative"
            lines.append(f"  {col}: r={corr} ({direction} correlation with pump ON)")

        lines += ["", "--- EMPIRICAL THRESHOLD RULES ---"]
        for rule in threshold_rules:
            lines.append(f"  • {rule}")

        lines += ["", "--- CONDITIONAL MEANS (pump ON vs OFF) ---"]
        for status, means in conditional_means.items():
            lines.append(f"  When pump is {status}:")
            for col, val in list(means.items())[:8]:  # limit to top 8 columns
                lines.append(f"    {col}: {val}")

        _summary_text = "\n".join(lines)
        print(f"[chatbot_routes] ✅ Dataset summary built ({len(_summary_text)} chars).")

    except Exception as exc:
        _summary_text = f"Error building dataset summary: {exc}"
        print(f"[chatbot_routes] ERROR during summary build: {exc}")
        traceback.print_exc()


# Build summary immediately on import
_build_dataset_summary()

# ── STEP 2: Dashboard page descriptions ──────────────────────────────────────

PAGE_DESCRIPTIONS = {
    "overview":       "The Overview page shows real-time gauge cards for all four sensors (Soil Moisture, Temperature, Humidity, Light Intensity), along with AI pump prediction and a mini trend sparkline.",
    "soil":           "The Soil Moisture detail page shows current value, a historical line chart of the last 20 readings, thresholds, and status badge.",
    "temp":           "The Temperature detail page shows current °C value with a historical trend chart, min/max bands, and AI-learnt bounds.",
    "hum":            "The Humidity detail page shows current % value, trend chart, and refining AI bounds from historical data.",
    "light":          "The Light Intensity page shows LDR (light-dependent resistor) readings, trends, and ambient light analysis.",
    "analytics":      "The AI Analytics page shows ML-driven insights: anomaly detection results, temperature/soil forecasting, feature correlation matrix, and Random Forest feature importance for pump control.",
    "history":        "The History Logs page shows a filterable table of all past sensor readings from Firebase, with export capability.",
    "notifications":  "The Alerts page shows all threshold-based and AI-generated alerts (critical, warning, info). You can mark them as read.",
    "settings":       "The Settings page allows customising alert thresholds for each of the four sensors, toggling auto-watering, and choosing notification preferences.",
    "chatbot":        "The GreenSense AI chatbot is the panel you are using right now — it can answer questions about sensor data, analytics, and help navigate the dashboard.",
}


# ── STEP 3: Endpoints ─────────────────────────────────────────────────────────

@chatbot_bp.route("/chat/context", methods=["GET"])
def get_chat_context():
    """Debug endpoint — returns the pre-computed dataset summary."""
    return jsonify({
        "summary_length_chars": len(_summary_text),
        "summary_preview": _summary_text[:500] + "…",
        "dataset_summary": _dataset_summary,
        "gemini_available": gemini_available,
    })


@chatbot_bp.route("/chat", methods=["POST"])
def chat():
    """
    Main chatbot endpoint.
    Body: {
        "message": str,           # the user's question
        "live_data": dict|null,   # latest sensor readings from Firebase
        "active_page": str|null   # which dashboard page is open
    }
    Returns: { "reply": str, "source": "gemini"|"fallback" }
    """
    body = request.get_json(silent=True) or {}
    user_message = (body.get("message") or "").strip()
    live_data     = body.get("live_data") or {}
    active_page   = body.get("active_page") or "overview"

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    # ── Build live sensor context ────────────────────────────────────────────
    live_context_lines = ["=== CURRENT LIVE SENSOR READINGS ==="]
    if live_data:
        for key, val in live_data.items():
            if val is not None:
                live_context_lines.append(f"  {key}: {val}")
    else:
        live_context_lines.append("  (No live data available at this moment)")

    live_context_lines.append(f"\nUser is currently viewing the '{active_page}' page.")
    page_desc = PAGE_DESCRIPTIONS.get(active_page, "")
    if page_desc:
        live_context_lines.append(f"Page description: {page_desc}")

    live_context = "\n".join(live_context_lines)

    # ── If Gemini is not available, use rule-based fallback ──────────────────
    if not gemini_available or client is None:
        reply = _rule_based_fallback(user_message, live_data, active_page)
        return jsonify({"reply": reply, "source": "fallback"})

    # ── Build full prompt ────────────────────────────────────────────────────
    full_prompt = f"""{_summary_text}

{live_context}

=== USER QUESTION ===
{user_message}

=== INSTRUCTIONS ===
Answer the user's question using the dataset context and live sensor data above.
- Be concise but thorough (3-8 sentences or bullet points).
- Reference specific numbers from the dataset context when relevant.
- If the question is about navigation, explain what the relevant dashboard page shows.
- If the question is about "what factors influence X", use the correlation and threshold data.
- Always give an actionable recommendation where applicable.
"""

    try:
        from google.genai import types  # type: ignore

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.7,
                top_p=0.95,
                max_output_tokens=1024,
            ),
        )
        reply_text = response.text.strip()
        return jsonify({"reply": reply_text, "source": "gemini"})

    except Exception as exc:
        print(f"[chatbot_routes] Gemini API error: {exc}")
        # Graceful degradation to rule-based
        reply = _rule_based_fallback(user_message, live_data, active_page)
        return jsonify({"reply": reply, "source": "fallback", "gemini_error": str(exc)})


# ── STEP 4: Rule-based fallback ───────────────────────────────────────────────

def _rule_based_fallback(message: str, live_data: dict, active_page: str) -> str:
    """
    Provides meaningful default answers when Gemini is unavailable,
    using the pre-computed dataset summary directly.
    """
    msg_lower = message.lower()

    if any(k in msg_lower for k in ["factor", "influence", "affect", "important", "predict"]):
        if _dataset_summary.get("top_influencing_factors"):
            factors = _dataset_summary["top_influencing_factors"]
            lines = ["Based on the TARP dataset, the top factors influencing pump Status are:"]
            for col, corr in factors:
                direction = "↑ higher → more likely ON" if corr > 0 else "↓ lower → more likely ON"
                lines.append(f"  • **{col}** (r={corr}) — {direction}")
            return "\n".join(lines)

    if any(k in msg_lower for k in ["status", "pump", "water", "irrigation", "on", "off"]):
        dist = _dataset_summary.get("status_distribution", {})
        rules = _dataset_summary.get("threshold_rules", [])
        reply = f"In the TARP dataset ({_dataset_summary.get('overview', {}).get('total_rows', '?'):,} records):\n"
        for s, info in dist.items():
            reply += f"  • Pump **{s}**: {info['count']:,} readings ({info['pct']}%)\n"
        if rules:
            reply += "\n**Key patterns:**\n"
            for rule in rules[:2]:
                reply += f"  • {rule}\n"
        return reply.strip()

    if any(k in msg_lower for k in ["navigate", "page", "go to", "show", "where", "find", "how to"]):
        page_desc = PAGE_DESCRIPTIONS.get(active_page, "")
        return (
            f"You are currently on the **{active_page.capitalize()}** page. "
            f"{page_desc}\n\n"
            "Use the left sidebar to navigate between Overview, Soil Moisture, "
            "Temperature, Humidity, Light Intensity, AI Analytics, History Logs, "
            "Alerts, and Settings."
        )

    if any(k in msg_lower for k in ["anomal", "unusual", "weird", "strange", "outlier"]):
        return (
            "Anomaly detection in this system uses **Isolation Forest** — a machine learning algorithm "
            "that identifies readings that deviate significantly from normal patterns. "
            "If an anomaly is detected in live data, you'll see an AI ALERT in the Alerts page. "
            f"In the TARP dataset, approximately 10% of readings are flagged as potential anomalies."
        )

    if any(k in msg_lower for k in ["soil", "moisture"]):
        s = _dataset_summary.get("statistics", {}).get("Soil Moisture", {})
        if s:
            return (
                f"**Soil Moisture** in the TARP dataset ranges from {s['min']} to {s['max']}, "
                f"with a mean of {s['mean']} (std: {s['std']}). "
                f"The median is {s['median']}. "
                "Low soil moisture (below ~23) is strongly associated with pump activation."
            )

    if any(k in msg_lower for k in ["temperature", "temp", "heat"]):
        s = _dataset_summary.get("statistics", {}).get("Temperature", {})
        if s:
            return (
                f"**Temperature** in the TARP dataset ranges from {s['min']}°C to {s['max']}°C, "
                f"average {s['mean']}°C. The live dashboard monitors real-time temperature "
                "and will alert you if it goes above your configured threshold (default 35°C)."
            )

    if any(k in msg_lower for k in ["dataset", "data", "tarp", "csv", "rows", "records"]):
        ov = _dataset_summary.get("overview", {})
        return (
            f"The **TARP dataset** contains **{ov.get('total_rows', '?'):,} records** across "
            f"**{ov.get('total_columns', '?')} features**: "
            f"{', '.join(ov.get('columns', []))}. "
            "It captures soil conditions, weather, nutrient levels (N, P, K), pH, rainfall, "
            "and the resulting irrigation pump Status (ON/OFF)."
        )

    # Generic fallback
    return (
        "I'm GreenSense AI — your smart greenhouse assistant. I can help you with:\n"
        "  • **Sensor data questions** — trends, ranges, anomalies\n"
        "  • **Dataset insights** — what factors influence pump activation\n"
        "  • **Dashboard navigation** — where to find specific charts\n"
        "  • **Decision support** — recommendations based on current readings\n\n"
        "Try asking: *'What factors influence pump status?'* or *'How is soil moisture trending?'*"
    )
