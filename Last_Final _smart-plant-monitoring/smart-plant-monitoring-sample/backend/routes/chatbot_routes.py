"""
chatbot_routes.py
-----------------
Flask blueprint powering the GreenSense AI chatbot.

Strategy for handling the 100,000-row TARP.csv without overloading the LLM:
  1. Load the CSV ONCE at startup using pandas.
  2. Pre-compute a rich statistical profile (≈ 1,500 tokens).
  3. At chat time, fetch LIVE Firebase data server-side AND accept frontend data.
  4. Maintain per-session conversation history for multi-turn context.
  5. Send only this compact summary — never raw rows — to Gemini.

Endpoints:
  GET  /api/chat/context             → returns the pre-computed dataset summary (debug/UI)
  GET  /api/dashboard-snapshot       → returns live sensor + analytics data for the chatbot UI
  POST /api/chat                     → accepts {message, live_data, active_page, chat_history} → LLM answer
  POST /api/chat/clear-history       → clears server-side conversation history for a session
"""

import json
import traceback
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests as http_requests
from flask import Blueprint, jsonify, request

# Import shared Gemini client from dedicated setup file
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from gemini_setup import client, MODEL_NAME, SYSTEM_INSTRUCTION, gemini_available

chatbot_bp = Blueprint("chatbot_bp", __name__)

# ── STEP 1: Load & summarise TARP.csv at startup ─────────────────────────────

DATASET_PATH = Path(__file__).resolve().parent.parent.parent / "dataset" / "TARP.csv"
FIREBASE_URL = "https://plant-b5ffc-default-rtdb.asia-southeast1.firebasedatabase.app/plant.json"

_dataset_summary = {}   # holds the pre-computed context dict
_summary_text = ""      # ready-to-inject string for Gemini prompts

# Session-based conversation history (keyed by session_id)
_conversation_histories = {}


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

        # ── Top 5 most-correlated features with pump Status ─────────────────
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

        # ── Seasonal / time-based patterns (if timestamp column exists) ──────
        temporal_notes = []
        ts_cols = [c for c in df.columns if 'time' in c.lower() or 'date' in c.lower()]
        if ts_cols:
            temporal_notes.append(f"Dataset contains temporal column(s): {', '.join(ts_cols)}.")

        # ── Assemble the full summary ───────────────────────────────────────
        _dataset_summary = {
            "overview": overview,
            "statistics": stats,
            "status_distribution": status_dist,
            "conditional_means_by_status": conditional_means,
            "correlation_with_pump_status": status_corr,
            "top_influencing_factors": top_factors,
            "threshold_rules": threshold_rules,
            "temporal_notes": temporal_notes,
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
    "overview":       "The Overview page shows real-time gauge cards for all four sensors (Soil Moisture, Temperature, Humidity, Light Intensity), along with AI pump prediction and a mini trend sparkline. Key metrics and live connection status are visible here.",
    "soil":           "The Soil Moisture detail page shows the current sensor value on a gauge, a 20-reading historical line chart, configurable min/max thresholds, and a status badge. Soil moisture below ~307 typically triggers pump activation.",
    "temp":           "The Temperature detail page shows current °C value with a historical trend chart, min/max threshold bands at 18–35°C, and AI-learnt bounds from historical data. Temperatures above 35°C trigger critical alerts.",
    "hum":            "The Humidity detail page shows current % value, trend chart, and AI-refined bounds. Normal range is 30–80%. Extremes indicate poor ventilation or rain infiltration.",
    "light":          "The Light Intensity page shows LDR (light-dependent resistor) readings on a gauge and trend chart. Values from 410–920 indicate optimal light; below that suggests low-light conditions affecting photosynthesis.",
    "analytics":      "The AI Analytics page shows ML-driven insights: Isolation Forest anomaly detection results, linear regression temperature/soil forecasting, Pearson feature correlation matrix, and Random Forest feature importance for pump control. This page interprets the historical TARP dataset and live sensor patterns.",
    "history":        "The History Logs page shows a filterable, sortable table of all past sensor readings fetched from Firebase, with CSV export capability. Use filters to see specific date ranges or sensor values.",
    "notifications":  "The Alerts page shows all threshold-based and AI-generated alerts categorised as Critical, Warning, Info, and AI Insights. You can mark them as read individually or all at once.",
    "settings":       "The Settings page allows customising alert thresholds for each of the four sensors, toggling auto-watering (which uses the Random Forest ML model), and choosing notification preferences. Changes persist in localStorage.",
    "chatbot":        "The GreenSense AI chatbot is the panel you are using right now — it can answer questions about sensor data, dataset analytics, dashboard navigation, and provide irrigation decision support powered by Google Gemini.",
}

# ── STEP 3: Live Firebase data fetcher ───────────────────────────────────────

def _fetch_live_firebase_data():
    """Fetch the latest sensor reading directly from Firebase (server-side)."""
    try:
        resp = http_requests.get(FIREBASE_URL, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if not data or not isinstance(data, dict):
                return {}

            # Handle flat reading (direct fields like temperature, humidity)
            if "temperature" in data or "humidity" in data:
                return {
                    "Soil Moisture (live)":   data.get("soil"),
                    "Air Temperature (live)": data.get("temperature"),
                    "Air Humidity (live)":    data.get("humidity"),
                    "Light Intensity (live)": data.get("ldr"),
                    "Pump Status":            data.get("pump"),
                    "Fan Status":             data.get("fan"),
                    "data_source":            "Firebase (live)",
                }

            # Handle nested readings: get most recent entry
            if data:
                # Try to get push-key-structured data
                entries = [v for v in data.values() if isinstance(v, dict)]
                if entries:
                    # Sort by timestamp if available
                    entries.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
                    latest = entries[0]
                    return {
                        "Soil Moisture (live)":   latest.get("soil") or latest.get("soil_moisture"),
                        "Air Temperature (live)": latest.get("temperature") or latest.get("air_temperature"),
                        "Air Humidity (live)":    latest.get("humidity") or latest.get("air_humidity"),
                        "Light Intensity (live)": latest.get("ldr") or latest.get("ldr_light"),
                        "data_source":            "Firebase (live)",
                    }
    except Exception as exc:
        print(f"[chatbot_routes] Firebase fetch failed: {exc}")
    return {}


def _fetch_ml_insights():
    """Fetch current ML analytics from the analytics endpoint."""
    try:
        resp = http_requests.get("http://127.0.0.1:5000/api/ml-insights", timeout=5)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return {}


# ── STEP 4: Endpoints ─────────────────────────────────────────────────────────

@chatbot_bp.route("/chat/context", methods=["GET"])
def get_chat_context():
    """Debug endpoint — returns the pre-computed dataset summary."""
    return jsonify({
        "summary_length_chars": len(_summary_text),
        "summary_preview": _summary_text[:500] + "…",
        "dataset_summary": _dataset_summary,
        "gemini_available": gemini_available,
    })


@chatbot_bp.route("/dashboard-snapshot", methods=["GET"])
def get_dashboard_snapshot():
    """
    Returns a real-time snapshot of all dashboard data for the chatbot UI panel.
    Combines live Firebase sensor data + ML analytics insights.
    """
    live = _fetch_live_firebase_data()
    ml   = _fetch_ml_insights()

    snapshot = {
        "live_sensors": {
            "soil_moisture":   live.get("Soil Moisture (live)"),
            "air_temperature": live.get("Air Temperature (live)"),
            "air_humidity":    live.get("Air Humidity (live)"),
            "light_intensity": live.get("Light Intensity (live)"),
            "pump_status":     live.get("Pump Status"),
            "fan_status":      live.get("Fan Status"),
        },
        "ml_insights": {
            "anomaly_detected":     ml.get("anomalies", {}).get("is_anomalous", False),
            "anomaly_count":        ml.get("anomalies", {}).get("count", 0),
            "temp_forecast":        ml.get("forecasting", {}).get("air_temperature"),
            "temp_trend":           ml.get("forecasting", {}).get("air_temperature_trend", "unknown"),
            "soil_forecast":        ml.get("forecasting", {}).get("soil_moisture"),
            "soil_trend":           ml.get("forecasting", {}).get("soil_moisture_trend", "unknown"),
        },
        "dataset_stats": {
            "total_records": _dataset_summary.get("overview", {}).get("total_rows", 0),
            "top_factors":   _dataset_summary.get("top_influencing_factors", []),
        },
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    return jsonify(snapshot)


@chatbot_bp.route("/chat", methods=["POST"])
def chat():
    """
    Main chatbot endpoint.
    Body: {
        "message": str,              # the user's question
        "live_data": dict|null,      # latest sensor readings from the frontend (optional)
        "active_page": str|null,     # which dashboard page is open
        "session_id": str|null,      # optional session key for conversation history
        "chat_history": list|null,   # client-side conversation history [{role, content}]
    }
    Returns: { "reply": str, "source": "gemini"|"fallback", "live_data_used": dict }
    """
    body = request.get_json(silent=True) or {}
    user_message  = (body.get("message") or "").strip()
    frontend_data = body.get("live_data") or {}
    active_page   = body.get("active_page") or "overview"
    session_id    = body.get("session_id") or "default"
    client_history = body.get("chat_history") or []

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    # ── Merge live data: server-side Firebase fetch + client-provided data ────
    server_live = _fetch_live_firebase_data()
    # Client-provided data takes priority (it may be calibrated already)
    merged_live = {**server_live, **{k: v for k, v in frontend_data.items() if v is not None}}

    # ── Fetch latest ML insights server-side ──────────────────────────────────
    ml_insights = _fetch_ml_insights()

    # ── Build live sensor context string ─────────────────────────────────────
    live_context_lines = ["=== CURRENT LIVE SENSOR READINGS (from Firebase) ==="]
    if merged_live:
        for key, val in merged_live.items():
            if val is not None and key != "data_source":
                live_context_lines.append(f"  {key}: {val}")
        if merged_live.get("data_source"):
            live_context_lines.append(f"  [Source: {merged_live['data_source']}]")
    else:
        live_context_lines.append("  (No live sensor data available at this moment)")

    live_context_lines.append(f"\nUser is currently viewing the '{active_page}' page.")
    page_desc = PAGE_DESCRIPTIONS.get(active_page, "")
    if page_desc:
        live_context_lines.append(f"Page description: {page_desc}")

    # ── Build ML insights context string ─────────────────────────────────────
    ml_context_lines = ["=== CURRENT ML ANALYTICS INSIGHTS ==="]
    if ml_insights and ml_insights.get("forecasting"):
        fc = ml_insights["forecasting"]
        ml_context_lines.append(f"  Temperature forecast (next reading): {fc.get('air_temperature', 'N/A')}°C ({fc.get('air_temperature_trend', 'unknown')} trend)")
        ml_context_lines.append(f"  Soil Moisture forecast (next reading): {fc.get('soil_moisture', 'N/A')} ({fc.get('soil_moisture_trend', 'unknown')} trend)")
    if ml_insights and ml_insights.get("anomalies"):
        an = ml_insights["anomalies"]
        status = "⚠️ ANOMALY DETECTED" if an.get("is_anomalous") else "✅ Normal patterns"
        ml_context_lines.append(f"  Anomaly Detection: {status} ({an.get('count', 0)} anomalous readings in window)")
    if ml_insights and ml_insights.get("refined_bounds"):
        rb = ml_insights["refined_bounds"]
        if "air_temperature" in rb:
            tb = rb["air_temperature"]
            ml_context_lines.append(f"  AI-learned Temperature 'Perfect Zone': {tb.get('learned_min', '?')}–{tb.get('learned_max', '?')}°C")
    if len(ml_context_lines) == 1:
        ml_context_lines.append("  (ML analytics not yet available — collecting data)")

    live_context = "\n".join(live_context_lines)
    ml_context   = "\n".join(ml_context_lines)

    # ── Intent detection for better prompting ────────────────────────────────
    msg_lower = user_message.lower()
    intent_hint = _detect_intent(msg_lower, active_page)

    # ── If Gemini is not available, use rule-based fallback ──────────────────
    if not gemini_available or client is None:
        reply = _rule_based_fallback(user_message, merged_live, active_page, ml_insights)
        return jsonify({"reply": reply, "source": "fallback", "live_data_used": merged_live})

    # ── Build conversation history context ────────────────────────────────────
    history_context = ""
    if client_history and len(client_history) > 1:
        # Include last 4 exchanges (8 messages) for context window efficiency
        recent = client_history[-8:]
        history_lines = ["=== RECENT CONVERSATION HISTORY ==="]
        for msg in recent[:-1]:  # exclude the current message
            role = "User" if msg.get("role") == "user" else "Assistant"
            history_lines.append(f"  {role}: {msg.get('content', '')[:200]}")
        history_context = "\n".join(history_lines) + "\n\n"

    # ── Build full prompt ────────────────────────────────────────────────────
    full_prompt = f"""{_summary_text}

{live_context}

{ml_context}

{history_context}=== USER QUESTION ===
{user_message}

=== RESPONSE INSTRUCTIONS ===
{intent_hint}
- Be concise but thorough (3-8 sentences or bullet points with **bold** for key terms).
- Always reference specific numbers from the dataset context or live sensor readings when relevant.
- If the question is about navigation, explain what the relevant dashboard page shows and how to get there.
- If the question asks "what factors influence X", use the correlation and threshold data from above.
- If anomalies are detected, explain what they mean and what action to take.
- If trends are rising/falling, calculate urgency and recommend a concrete action.
- Always give an actionable recommendation where applicable.
- Use markdown formatting: **bold**, bullet points (•), numbered lists where appropriate.
"""

    try:
        from google.genai import types  # type: ignore

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.65,
                top_p=0.92,
                max_output_tokens=1200,
            ),
        )
        reply_text = response.text.strip()
        return jsonify({
            "reply": reply_text,
            "source": "gemini",
            "live_data_used": merged_live,
            "ml_context_used": bool(ml_insights),
        })

    except Exception as exc:
        print(f"[chatbot_routes] Gemini API error: {exc}")
        # Graceful degradation to rule-based
        reply = _rule_based_fallback(user_message, merged_live, active_page, ml_insights)
        return jsonify({
            "reply": reply,
            "source": "fallback",
            "gemini_error": str(exc),
            "live_data_used": merged_live,
        })


@chatbot_bp.route("/chat/proactive-insight", methods=["GET"])
def get_proactive_insight():
    """
    Returns a single proactive insight based on current live sensor data + ML analytics.
    Called by the frontend when the chatbot panel opens to show a live-aware greeting.
    """
    live = _fetch_live_firebase_data()
    ml   = _fetch_ml_insights()

    insights = []

    # Check anomaly
    if ml.get("anomalies", {}).get("is_anomalous"):
        insights.append("⚠️ **Anomaly Detected**: Unusual sensor patterns are active right now. Check the AI Analytics page for details.")

    # Check temp trend
    temp_val   = live.get("Air Temperature (live)")
    temp_trend = ml.get("forecasting", {}).get("air_temperature_trend", "unknown")
    if temp_val and temp_trend == "rising" and float(temp_val) > 33:
        insights.append(f"🌡️ **Rising Temperature Alert**: Current temp is {temp_val}°C and trending upward. Consider activating the fan.")

    # Check soil moisture
    soil_val = live.get("Soil Moisture (live)")
    if soil_val and float(soil_val) < 307:
        insights.append(f"💧 **Low Soil Moisture**: Soil moisture at {soil_val} — below dry threshold (307). Irrigation may be needed.")

    # Check soil trend
    soil_trend = ml.get("forecasting", {}).get("soil_moisture_trend", "unknown")
    if soil_trend == "falling" and soil_val:
        insights.append(f"📉 **Soil Moisture Falling**: Trend is downward ({soil_val}). Monitor closely and consider watering soon.")

    # Default positive insight
    if not insights:
        if temp_val and soil_val:
            insights.append(f"✅ **All Systems Normal**: Temperature {temp_val}°C, Soil Moisture {soil_val} — readings look healthy.")
        else:
            insights.append("🌱 **GreenSense AI is ready!** Ask me anything about your greenhouse data, trends, or decisions.")

    return jsonify({
        "insight": insights[0],
        "all_insights": insights,
        "live_data": live,
    })


# ── STEP 5: Intent detection ──────────────────────────────────────────────────

def _detect_intent(msg_lower: str, active_page: str) -> str:
    """Returns extra instruction hints based on detected user intent."""

    if any(k in msg_lower for k in ["factor", "influence", "affect", "important", "what causes", "why"]):
        return "- Focus on the correlation analysis and threshold rules. Rank factors by importance with specific r-values."

    if any(k in msg_lower for k in ["navigate", "go to", "show me", "where", "find", "how do i"]):
        return f"- Focus on dashboard navigation. The user is on the '{active_page}' page. Explain how to navigate to the relevant section."

    if any(k in msg_lower for k in ["anomal", "unusual", "weird", "strange", "outlier", "spike"]):
        return "- Explain anomaly detection in plain language. Reference if an anomaly is currently active. Suggest investigative steps."

    if any(k in msg_lower for k in ["should i water", "irrigat", "pump", "when to water", "water now"]):
        return "- Give a direct irrigation recommendation. Use live soil moisture, temperature, ML pump prediction, and threshold rules."

    if any(k in msg_lower for k in ["trend", "forecast", "predict", "future", "going", "will it"]):
        return "- Focus on the ML forecasting results. State the trend direction, predicted next value, and urgency."

    if any(k in msg_lower for k in ["compare", "vs", "versus", "difference", "better"]):
        return "- Make a clear comparison using statistics from the dataset (mean, min, max, correlation). Use a structured bullet list."

    if any(k in msg_lower for k in ["explain", "what is", "what does", "how does", "meaning"]):
        return "- Give a clear educational explanation. Reference the actual dashboard feature and dataset to make it concrete."

    if any(k in msg_lower for k in ["decision", "recommend", "advise", "best action", "what should"]):
        return "- Lead with a clear 1-sentence recommendation. Back it up with data. Consider both current live readings and historical patterns."

    return "- Answer directly and concisely. Always tie your answer back to the dashboard data or TARP dataset statistics."


# ── STEP 6: Rule-based fallback ───────────────────────────────────────────────

def _rule_based_fallback(message: str, live_data: dict, active_page: str, ml_insights: dict = None) -> str:
    """
    Provides meaningful default answers when Gemini is unavailable,
    using the pre-computed dataset summary and live data directly.
    """
    msg_lower = message.lower()
    ml_insights = ml_insights or {}

    # ── Irrigation decision support ──────────────────────────────────────────
    if any(k in msg_lower for k in ["should i water", "water now", "irrigat", "pump on"]):
        soil = live_data.get("Soil Moisture (live)") or live_data.get("Soil Moisture")
        if soil is not None:
            soil_f = float(soil)
            if soil_f < 307:
                return (
                    f"💧 **Yes, irrigation is recommended.** Current soil moisture is **{soil_f:.0f}** — "
                    f"below the dry threshold of 307. The TARP dataset confirms that "
                    f"when soil moisture is this low, the pump is activated {_get_threshold_stat('low')} of the time. "
                    f"Activate the water pump from the Overview page or enable Auto-Watering in Settings."
                )
            elif soil_f > 716:
                return (
                    f"🚫 **No, irrigation is not needed.** Soil moisture is **{soil_f:.0f}** — "
                    f"above the wet threshold of 716. Over-watering can cause root rot. "
                    f"Wait until moisture drops below 600 before considering irrigation."
                )
            else:
                return (
                    f"✅ **Soil moisture looks healthy** at **{soil_f:.0f}** (optimal range: 307–716). "
                    f"No immediate irrigation needed. Continue monitoring — check the Soil Moisture detail page for trends."
                )
        return "Please check the live sensor reading on the Overview page. Irrigation decision requires a current soil moisture reading."

    # ── Anomaly questions ────────────────────────────────────────────────────
    if any(k in msg_lower for k in ["anomal", "unusual", "weird", "strange", "outlier"]):
        is_anomalous = ml_insights.get("anomalies", {}).get("is_anomalous", False)
        count = ml_insights.get("anomalies", {}).get("count", 0)
        if is_anomalous:
            return (
                f"⚠️ **Anomaly is currently active!** The Isolation Forest ML model has flagged "
                f"**{count} anomalous reading(s)** in the recent window. This suggests unusual sensor patterns "
                f"that deviate significantly from historical norms. Possible causes: hardware interference, "
                f"sudden environment shift, or pest activity. Check the **AI Analytics** page for the full anomaly report."
            )
        return (
            "✅ **No anomalies currently detected.** The Isolation Forest algorithm monitors all four sensors "
            "(soil moisture, temperature, humidity, light) simultaneously. Anomalies are flagged when readings "
            "deviate from the learned normal distribution. Visit the **AI Analytics** page to see historical anomaly counts."
        )

    # ── Trend / forecast questions ───────────────────────────────────────────
    if any(k in msg_lower for k in ["trend", "forecast", "predict", "rising", "falling"]):
        fc = ml_insights.get("forecasting", {})
        temp_trend = fc.get("air_temperature_trend", "unknown")
        temp_next  = fc.get("air_temperature")
        soil_trend = fc.get("soil_moisture_trend", "unknown")
        soil_next  = fc.get("soil_moisture")
        lines = ["📈 **Current ML Forecasts** (Linear Regression on recent Firebase data):"]
        if temp_next:
            lines.append(f"  • **Temperature**: next reading forecast at **{temp_next}°C** (trend: {temp_trend})")
        if soil_next:
            lines.append(f"  • **Soil Moisture**: next reading forecast at **{soil_next}** (trend: {soil_trend})")
        if temp_trend == "rising":
            lines.append("  ⚠️ Rising temperature trend — watch for heat stress above 35°C.")
        if soil_trend == "falling":
            lines.append("  💧 Falling soil moisture — irrigation may be needed soon.")
        lines.append("\nVisit the **AI Analytics** page for full forecast charts.")
        return "\n".join(lines)

    # ── Factor analysis ──────────────────────────────────────────────────────
    if any(k in msg_lower for k in ["factor", "influence", "affect", "important", "predict"]):
        if _dataset_summary.get("top_influencing_factors"):
            factors = _dataset_summary["top_influencing_factors"]
            lines = ["Based on the TARP dataset, the top factors influencing pump Status are:"]
            for col, corr in factors:
                direction = "↑ higher → more likely ON" if corr > 0 else "↓ lower → more likely ON"
                lines.append(f"  • **{col}** (r={corr}) — {direction}")
            lines.append("\nSee the **AI Analytics** page → Feature Importance chart for the Random Forest model view.")
            return "\n".join(lines)

    # ── Pump/irrigation status ───────────────────────────────────────────────
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
        pump_live = live_data.get("Pump Status")
        if pump_live is not None:
            reply += f"\n🔴 **Current pump state**: {'ON (active)' if pump_live else 'OFF'}"
        return reply.strip()

    # ── Navigation questions ─────────────────────────────────────────────────
    if any(k in msg_lower for k in ["navigate", "page", "go to", "show", "where", "find", "how to"]):
        page_desc = PAGE_DESCRIPTIONS.get(active_page, "")
        all_pages = ", ".join(f"**{p.capitalize()}**" for p in PAGE_DESCRIPTIONS.keys())
        return (
            f"You are currently on the **{active_page.capitalize()}** page.\n"
            f"{page_desc}\n\n"
            f"Available pages: {all_pages}.\n"
            "Use the **left sidebar** to navigate between them."
        )

    # ── Soil moisture ────────────────────────────────────────────────────────
    if any(k in msg_lower for k in ["soil", "moisture"]):
        s = _dataset_summary.get("statistics", {}).get("Soil Moisture", {})
        live_val = live_data.get("Soil Moisture (live)")
        reply = ""
        if live_val:
            status = "🔴 DRY" if float(live_val) < 307 else ("💦 WET" if float(live_val) > 716 else "✅ OK")
            reply = f"**Live Soil Moisture**: {live_val} [{status}]\n\n"
        if s:
            reply += (
                f"**Dataset Stats** — ranges from {s['min']} to {s['max']}, "
                f"mean={s['mean']} (std: {s['std']}), median={s['median']}. "
                "Low soil moisture (below ~307) is strongly associated with pump activation."
            )
        return reply or "Check the **Soil Moisture** page in the sidebar for detailed trend data."

    # ── Temperature ──────────────────────────────────────────────────────────
    if any(k in msg_lower for k in ["temperature", "temp", "heat"]):
        s = _dataset_summary.get("statistics", {}).get("Temperature", {})
        live_val = live_data.get("Air Temperature (live)")
        reply = ""
        if live_val:
            status = "🔥 HIGH" if float(live_val) > 35 else ("❄️ LOW" if float(live_val) < 18 else "✅ OK")
            reply = f"**Live Temperature**: {live_val}°C [{status}]\n\n"
        if s:
            reply += (
                f"**Dataset Stats** — range {s['min']}°C–{s['max']}°C, average {s['mean']}°C. "
                "The dashboard alerts you if temperature exceeds your configured threshold (default 35°C)."
            )
        return reply or "Check the **Temperature** page in the sidebar for detailed trend data."

    # ── Humidity ─────────────────────────────────────────────────────────────
    if any(k in msg_lower for k in ["humid", "moisture air", "vapour"]):
        live_val = live_data.get("Air Humidity (live)")
        reply = ""
        if live_val:
            status = "💨 LOW" if float(live_val) < 30 else ("🌊 HIGH" if float(live_val) > 80 else "✅ OK")
            reply = f"**Live Humidity**: {live_val}% [{status}]\n\n"
        reply += "Optimal greenhouse humidity: **30–80%**. Above 80% risks fungal diseases; below 30% causes plant stress."
        return reply

    # ── Light intensity ──────────────────────────────────────────────────────
    if any(k in msg_lower for k in ["light", "ldr", "solar", "sun", "luminosity"]):
        live_val = live_data.get("Light Intensity (live)")
        reply = ""
        if live_val:
            status = "🌑 LOW" if float(live_val) < 410 else ("☀️ HIGH" if float(live_val) > 920 else "✅ OK")
            reply = f"**Live Light Intensity**: {live_val} [{status}]\n\n"
        reply += "Optimal light range: **410–920** (LDR units). Low readings indicate insufficient photosynthesis conditions."
        return reply

    # ── Dataset overview ─────────────────────────────────────────────────────
    if any(k in msg_lower for k in ["dataset", "data", "tarp", "csv", "rows", "records"]):
        ov = _dataset_summary.get("overview", {})
        return (
            f"The **TARP dataset** contains **{ov.get('total_rows', '?'):,} records** across "
            f"**{ov.get('total_columns', '?')} features**: "
            f"{', '.join(ov.get('columns', []))}. "
            "It captures soil conditions, weather, nutrient levels (N, P, K), pH, rainfall, "
            "and the resulting irrigation pump Status (ON/OFF). Used for ML model training and correlation analysis."
        )

    # ── Live sensor summary ──────────────────────────────────────────────────
    if any(k in msg_lower for k in ["current", "right now", "live", "latest", "now"]):
        if live_data:
            lines = ["📡 **Current Live Sensor Readings:**"]
            for k, v in live_data.items():
                if v is not None and k != "data_source":
                    lines.append(f"  • {k}: **{v}**")
            return "\n".join(lines)
        return "Live sensor data is not available. Check Firebase connectivity and ensure the ESP32 is transmitting data."

    # Generic fallback
    return (
        "I'm **GreenSense AI** — your smart greenhouse assistant. I can help you with:\n"
        "  • 📡 **Live sensor data** — current readings, status, trends\n"
        "  • 📊 **Dataset insights** — what factors influence pump activation\n"
        "  • 🗺️ **Dashboard navigation** — where to find specific charts\n"
        "  • 🤖 **ML analytics** — anomalies, forecasts, feature importance\n"
        "  • 💧 **Irrigation decisions** — should I water now?\n\n"
        "Try asking: *'Should I water now?'* or *'What factors influence pump status?'* or *'Is there any anomaly?'*"
    )


def _get_threshold_stat(level: str) -> str:
    """Returns the pump activation % for low/high soil moisture from dataset."""
    rules = _dataset_summary.get("threshold_rules", [])
    for rule in rules:
        if "Soil Moisture" in rule and level in rule.lower():
            # Extract the percentage
            import re
            match = re.search(r"ON (\d+\.\d+)%", rule)
            if match:
                return f"{match.group(1)}%"
    return ">70%"
