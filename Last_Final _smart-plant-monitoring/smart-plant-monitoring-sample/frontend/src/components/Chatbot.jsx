import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:5000/api';

// ── Session ID (persist across mounts) ──────────────────────────────────────
const SESSION_ID = `gs-${Math.random().toString(36).slice(2, 10)}`;

// ── Page-aware suggestion chips ───────────────────────────────────────────────
const PAGE_SUGGESTIONS = {
  overview: [
    { label: '💧 Should I water now?',          message: 'Based on the current live sensor readings, should I water the plants now?' },
    { label: '🤖 What does AI predict?',        message: 'What is the current AI pump prediction and what does it mean?' },
    { label: '📡 Explain live readings',         message: 'Can you explain what my current live sensor readings mean for my plants?' },
    { label: '⚠️ Any anomalies right now?',     message: 'Is there any anomaly detected in the current sensor data?' },
  ],
  soil: [
    { label: '💧 Is soil moisture ok?',         message: 'Is the current soil moisture level healthy for my plants?' },
    { label: '📉 What influences soil?',        message: 'What factors from the TARP dataset influence soil moisture levels?' },
    { label: '🔔 When should I water?',         message: 'Based on historical data, at what soil moisture level should I water?' },
    { label: '📈 Soil moisture trend?',         message: 'What is the current soil moisture trend - rising or falling?' },
  ],
  temp: [
    { label: '🌡️ Is temp dangerous?',          message: 'Is the current temperature dangerous for my plants? What is the safe range?' },
    { label: '📈 Temperature trend?',           message: 'What is the current temperature trend and what should I do?' },
    { label: '🌡️ What causes high temp?',      message: 'What factors in the TARP dataset correlate with high temperature?' },
    { label: '❄️ Heat stress prevention',       message: 'How can I prevent heat stress based on current temperature readings?' },
  ],
  hum: [
    { label: '💨 Is humidity healthy?',         message: 'Is the current air humidity level optimal for plant growth?' },
    { label: '🍄 Fungal disease risk?',         message: 'What is the fungal disease risk based on current humidity?' },
    { label: '📊 Humidity vs pump',              message: 'How does humidity relate to pump activation in the dataset?' },
    { label: '🌊 Ideal humidity range?',        message: 'What is the ideal humidity range for this greenhouse?' },
  ],
  light: [
    { label: '☀️ Is light optimal?',            message: 'Is the current light intensity optimal for photosynthesis?' },
    { label: '🌑 Low light effects?',           message: 'What happens to plants when light intensity is too low?' },
    { label: '📊 Light vs other sensors',       message: 'How does light intensity correlate with other sensor readings?' },
    { label: '💡 Light intensity range?',       message: 'What is the healthy light intensity range for this system?' },
  ],
  analytics: [
    { label: '🤖 Explain anomaly detection',    message: 'How does the Isolation Forest anomaly detection work in this system?' },
    { label: '📈 What do forecasts mean?',      message: 'How should I interpret the ML temperature and soil moisture forecasts?' },
    { label: '🔗 Which features matter most?',  message: 'What factors influence pump status the most according to the Random Forest model?' },
    { label: '📊 Explain correlation matrix',   message: 'Can you explain the sensor correlation matrix and what it tells us?' },
  ],
  history: [
    { label: '📅 How to filter history?',       message: 'How do I filter and explore the history logs effectively?' },
    { label: '📤 Can I export data?',           message: 'How can I export the historical sensor data?' },
    { label: '📉 Historical trends?',           message: 'What interesting trends can I find in the historical sensor logs?' },
    { label: '🔍 Find anomalies in history',    message: 'How can I identify anomalous readings in the historical logs?' },
  ],
  notifications: [
    { label: '🔔 Explain alert types',          message: 'What do the different alert types (Critical, Warning, AI) mean?' },
    { label: '✅ How to clear alerts?',          message: 'How do I manage and clear my alerts?' },
    { label: '⚙️ Adjust thresholds',            message: 'How can I adjust alert thresholds to reduce false alarms?' },
    { label: '🤖 What are AI alerts?',          message: 'What are AI-powered alerts and how are they different from threshold alerts?' },
  ],
  settings: [
    { label: '💧 Auto-watering setup',          message: 'How does the auto-watering feature work and how do I set it up?' },
    { label: '⚙️ Optimal thresholds',           message: 'What are the recommended threshold values for each sensor?' },
    { label: '🔔 Notification options',         message: 'What notification options are available in the system?' },
    { label: '🤖 AI model explanation',         message: 'What ML model is used for pump prediction and how accurate is it?' },
  ],
};

const DEFAULT_SUGGESTIONS = PAGE_SUGGESTIONS.overview;

// ── Utility: format timestamp ─────────────────────────────────────────────────
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Utility: copy text to clipboard ──────────────────────────────────────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Typing Indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="chat-typing-indicator">
      <span /><span /><span />
    </div>
  );
}

// ── Markdown renderer (bold, italic, bullets, numbered lists, code) ───────────
function renderMarkdown(text) {
  const lines = text.split('\n');
  let inCode = false;
  const result = [];

  lines.forEach((line, i) => {
    // Code block toggle
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      return;
    }
    if (inCode) {
      result.push(<div key={i} className="chat-code-line">{line}</div>);
      return;
    }

    // Numbered list
    const numMatch = line.match(/^\s*(\d+)\.\s+(.*)/);
    if (numMatch) {
      result.push(
        <div key={i} className="chat-numbered-line">
          <span className="chat-num">{numMatch[1]}.</span>
          <span>{renderInline(numMatch[2])}</span>
        </div>
      );
      return;
    }

    // Bullet lines
    if (line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*')) {
      const content = line.replace(/^\s*[•\-*]\s?/, '');
      result.push(<div key={i} className="chat-bullet-line"><span className="chat-bullet-icon">•</span><span>{renderInline(content)}</span></div>);
      return;
    }

    // Heading-like (##)
    if (line.trim().startsWith('## ')) {
      result.push(<div key={i} className="chat-heading">{renderInline(line.replace('## ', ''))}</div>);
      return;
    }
    if (line.trim().startsWith('# ')) {
      result.push(<div key={i} className="chat-heading">{renderInline(line.replace('# ', ''))}</div>);
      return;
    }

    // Blank line = spacer
    if (line.trim() === '') {
      result.push(<div key={i} className="chat-spacer" />);
      return;
    }

    result.push(<div key={i}>{renderInline(line)}</div>);
  });

  return result;
}

function renderInline(text) {
  // Process **bold**, *italic*, `code` inline
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={match.index} className="chat-inline-code">{token.slice(1, -1)}</code>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}

// ── Chat Message Component ────────────────────────────────────────────────────
function ChatMessage({ msg, onCopy }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(msg.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy && onCopy();
    }
  };

  return (
    <div className={`chat-message-row ${isUser ? 'user' : 'bot'}`}>
      {!isUser && (
        <div className="chat-avatar bot-avatar" title="GreenSense AI">🌿</div>
      )}
      <div className="chat-message-wrapper">
        <div className={`chat-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
          {isUser
            ? <div>{msg.content}</div>
            : renderMarkdown(msg.content)
          }
          {msg.source && msg.source !== 'gemini' && (
            <div className="chat-source-badge">⚡ Offline mode</div>
          )}
        </div>
        <div className={`chat-meta ${isUser ? 'meta-right' : 'meta-left'}`}>
          <span className="chat-time">{formatTime(msg.ts || Date.now())}</span>
          {!isUser && (
            <button className="chat-copy-btn" onClick={handleCopy} title="Copy message">
              {copied ? '✓' : '⎘'}
            </button>
          )}
        </div>
      </div>
      {isUser && (
        <div className="chat-avatar user-avatar" title="You">👤</div>
      )}
    </div>
  );
}

// ── Live Sensor Mini Panel ─────────────────────────────────────────────────────
function LiveSensorPanel({ snapshot }) {
  if (!snapshot) return null;
  const { live_sensors, ml_insights } = snapshot;
  if (!live_sensors) return null;

  const sensors = [
    { key: 'soil_moisture',   label: 'Soil',  unit: '',   icon: '🌱', good: v => v >= 307 && v <= 716,  warn: v => v < 307 },
    { key: 'air_temperature', label: 'Temp',  unit: '°C', icon: '🌡️', good: v => v >= 18 && v <= 35,   warn: v => v > 35 },
    { key: 'air_humidity',    label: 'Humid', unit: '%',  icon: '💧', good: v => v >= 30 && v <= 80,   warn: v => v < 30 },
    { key: 'light_intensity', label: 'Light', unit: '',   icon: '☀️', good: v => v >= 410 && v <= 920,  warn: v => v < 410 },
  ];

  return (
    <div className="chat-sensor-panel">
      <div className="chat-sensor-panel-title">
        <span className="chat-live-dot" />
        Live Dashboard Readings
      </div>
      <div className="chat-sensor-grid">
        {sensors.map(s => {
          const val = live_sensors[s.key];
          const isGood = val != null && s.good(parseFloat(val));
          const isWarn = val != null && s.warn(parseFloat(val));
          const statusClass = val == null ? 'sensor-null' : isWarn ? 'sensor-warn' : isGood ? 'sensor-ok' : 'sensor-info';
          return (
            <div key={s.key} className={`chat-sensor-card ${statusClass}`}>
              <span className="sensor-icon">{s.icon}</span>
              <span className="sensor-label">{s.label}</span>
              <span className="sensor-value">
                {val != null ? `${parseFloat(val).toFixed(1)}${s.unit}` : '--'}
              </span>
            </div>
          );
        })}
      </div>
      {ml_insights && (
        <div className="chat-ml-row">
          {ml_insights.anomaly_detected && (
            <span className="chat-ml-badge badge-warn">⚠️ Anomaly Active</span>
          )}
          {ml_insights.temp_trend && ml_insights.temp_trend !== 'unknown' && (
            <span className={`chat-ml-badge ${ml_insights.temp_trend === 'rising' ? 'badge-warn' : 'badge-ok'}`}>
              {ml_insights.temp_trend === 'rising' ? '↑' : '↓'} Temp {ml_insights.temp_trend}
            </span>
          )}
          {ml_insights.soil_trend && ml_insights.soil_trend !== 'unknown' && (
            <span className={`chat-ml-badge ${ml_insights.soil_trend === 'falling' ? 'badge-warn' : 'badge-ok'}`}>
              {ml_insights.soil_trend === 'falling' ? '↓' : '↑'} Soil {ml_insights.soil_trend}
            </span>
          )}
          {!ml_insights.anomaly_detected && ml_insights.temp_trend === 'unknown' && (
            <span className="chat-ml-badge badge-ok">✅ All Normal</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Chatbot Component ────────────────────────────────────────────────────
export default function Chatbot({ latest, aiInsights, activePage }) {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState('chat'); // 'chat' | 'sensors'
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'bot',
      ts: Date.now(),
      content:
        "Hello! I'm **GreenSense AI** 🌿 — your intelligent greenhouse assistant.\n\n" +
        "I can answer questions about your **live sensor data**, **TARP dataset** insights, " +
        "**dashboard navigation**, **ML analytics**, and give **irrigation recommendations**.\n\n" +
        "What would you like to know?",
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading]   = useState(false);
  const [hasUnread, setHasUnread]   = useState(false);
  const [snapshot, setSnapshot]     = useState(null);
  const [proactiveInsight, setProactiveInsight] = useState(null);
  const [showSensorPanel, setShowSensorPanel]   = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // ── Focus input + fetch proactive insight when opened ───────────────────────
  useEffect(() => {
    if (open) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 150);
      fetchSnapshot();
      fetchProactiveInsight();
    }
  }, [open]);

  // ── Fetch dashboard snapshot (live sensor + ML) ─────────────────────────────
  const fetchSnapshot = useCallback(async () => {
    try {
      const resp = await axios.get(`${API_BASE}/dashboard-snapshot`);
      setSnapshot(resp.data);
    } catch (err) {
      console.warn('[Chatbot] Could not fetch dashboard snapshot:', err.message);
    }
  }, []);

  // ── Fetch proactive insight ─────────────────────────────────────────────────
  const fetchProactiveInsight = useCallback(async () => {
    try {
      const resp = await axios.get(`${API_BASE}/chat/proactive-insight`);
      setProactiveInsight(resp.data?.insight);
    } catch {
      /* silent */
    }
  }, []);

  // ── Refresh snapshot every 30s when open ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(fetchSnapshot, 30000);
    return () => clearInterval(interval);
  }, [open, fetchSnapshot]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || inputValue).trim();
    if (!trimmed || isLoading) return;

    const userMsg = { id: Date.now(), role: 'user', ts: Date.now(), content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Build live sensor context from current dashboard data
      const live_data = latest
        ? {
            'Soil Moisture (live)':   latest.soil_moisture,
            'Air Temperature (live)': latest.air_temperature,
            'Air Humidity (live)':    latest.air_humidity,
            'Light Intensity (live)': latest.ldr_light,
          }
        : {};

      // Enrich with AI insights if available
      if (aiInsights?.forecasting) {
        live_data['AI Temp Forecast (next)'] = aiInsights.forecasting.air_temperature;
        live_data['AI Temp Trend']           = aiInsights.forecasting.air_temperature_trend;
        live_data['AI Soil Forecast (next)'] = aiInsights.forecasting.soil_moisture;
        live_data['AI Soil Trend']           = aiInsights.forecasting.soil_moisture_trend;
      }
      if (aiInsights?.anomalies?.is_anomalous !== undefined) {
        live_data['AI Anomaly Detected'] = aiInsights.anomalies.is_anomalous ? 'YES' : 'NO';
        live_data['Anomaly Count']       = aiInsights.anomalies.count;
      }
      if (aiInsights?.refined_bounds?.air_temperature) {
        const tb = aiInsights.refined_bounds.air_temperature;
        live_data['AI Learned Temp Zone'] = `${tb.learned_min}–${tb.learned_max}°C`;
      }

      // Build chat history for multi-turn context (last 8 messages)
      const chatHistory = messages.slice(-8).map(m => ({
        role:    m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

      const resp = await axios.post(`${API_BASE}/chat`, {
        message:      trimmed,
        live_data,
        active_page:  activePage || 'overview',
        session_id:   SESSION_ID,
        chat_history: chatHistory,
      });

      const botMsg = {
        id:      Date.now() + 1,
        role:    'bot',
        ts:      Date.now(),
        content: resp.data.reply || 'I could not generate a response. Please try again.',
        source:  resp.data.source,
      };
      setMessages(prev => [...prev, botMsg]);

      // Refresh snapshot after each exchange
      fetchSnapshot();

      if (!open) setHasUnread(true);

    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id:      Date.now() + 1,
          role:    'bot',
          ts:      Date.now(),
          content: '⚠️ I had trouble connecting to the AI backend. Make sure the Python server is running on port 5000, then try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, latest, aiInsights, activePage, open, messages, fetchSnapshot]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      id:      'welcome-reset',
      role:    'bot',
      ts:      Date.now(),
      content: "Chat cleared! I'm ready for your next question 🌿",
    }]);
    setProactiveInsight(null);
  };

  const suggestions = PAGE_SUGGESTIONS[activePage] || DEFAULT_SUGGESTIONS;
  const showSuggestions = messages.length <= 1;

  return (
    <>
      {/* ── Styles ──────────────────────────────────────────────────────── */}
      <style>{`
        /* ── FAB ─────────────────────────────────────────────────────── */
        .chatbot-fab {
          position: fixed;
          bottom: 28px;
          right: 28px;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border: none;
          box-shadow: 0 4px 24px rgba(34,197,94,0.5);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          transition: transform 0.2s, box-shadow 0.2s;
          z-index: 9999;
        }
        .chatbot-fab:hover { transform: scale(1.1); box-shadow: 0 6px 32px rgba(34,197,94,0.65); }
        .chatbot-fab:active { transform: scale(0.95); }

        .chatbot-fab-pulse {
          position: absolute;
          inset: -5px;
          border-radius: 50%;
          background: rgba(34,197,94,0.3);
          animation: fabPulse 2.5s ease-in-out infinite;
        }
        @keyframes fabPulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50%       { transform: scale(1.3); opacity: 0; }
        }

        .chatbot-unread-dot {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ef4444;
          border: 2.5px solid #fff;
          font-size: 9px;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          animation: blink 1.2s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }

        /* ── Chat Panel ─────────────────────────────────────────────── */
        .chatbot-panel {
          position: fixed;
          bottom: 108px;
          right: 28px;
          width: 420px;
          max-width: calc(100vw - 40px);
          height: 620px;
          max-height: calc(100vh - 148px);
          border-radius: 22px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08);
          z-index: 9998;
          transform-origin: bottom right;
          transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s;
        }
        .chatbot-panel.closed {
          transform: scale(0.82) translateY(24px);
          opacity: 0;
          pointer-events: none;
        }
        .chatbot-panel.open {
          transform: scale(1) translateY(0);
          opacity: 1;
        }

        /* ── Header ─────────────────────────────────────────────────── */
        .chat-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: linear-gradient(135deg, #14532d 0%, #166534 50%, #16a34a 100%);
          flex-shrink: 0;
          position: relative;
        }
        .chat-header-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
          border: 1.5px solid rgba(255,255,255,0.2);
        }
        .chat-header-info { flex: 1; min-width: 0; }
        .chat-header-title {
          font-weight: 700;
          font-size: 0.95rem;
          color: #fff;
          letter-spacing: 0.01em;
        }
        .chat-header-sub {
          font-size: 0.7rem;
          color: rgba(255,255,255,0.7);
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 2px;
        }
        .chat-online-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #86efac;
          display: inline-block;
          box-shadow: 0 0 6px #86efac;
          animation: pulseOnline 2s infinite;
        }
        @keyframes pulseOnline {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #86efac; }
          50%       { opacity: 0.5; box-shadow: 0 0 12px #86efac; }
        }
        .chat-header-actions { display: flex; gap: 6px; }
        .chat-icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: rgba(255,255,255,0.13);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          transition: background 0.18s;
        }
        .chat-icon-btn:hover { background: rgba(255,255,255,0.26); }
        .chat-icon-btn.active { background: rgba(255,255,255,0.26); }

        /* ── Proactive Insight Banner ────────────────────────────────── */
        .chat-proactive-banner {
          padding: 8px 14px;
          background: rgba(34,197,94,0.1);
          border-bottom: 1px solid rgba(34,197,94,0.2);
          font-size: 0.75rem;
          color: #86efac;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          animation: slideDown 0.3s ease;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Messages Area ──────────────────────────────────────────── */
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: var(--bg-main, #0f172a);
          scrollbar-width: thin;
          scrollbar-color: rgba(34,197,94,0.25) transparent;
        }
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(34,197,94,0.25);
          border-radius: 4px;
        }

        /* ── Message Rows ───────────────────────────────────────────── */
        .chat-message-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          animation: msgIn 0.22s ease;
        }
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .chat-message-row.user { flex-direction: row-reverse; }

        .chat-message-wrapper { display: flex; flex-direction: column; max-width: 80%; }

        .chat-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .bot-avatar  { background: rgba(34,197,94,0.12); border: 1.5px solid rgba(34,197,94,0.3); }
        .user-avatar { background: rgba(99,102,241,0.12); border: 1.5px solid rgba(99,102,241,0.3); }

        .chat-bubble {
          padding: 10px 13px;
          border-radius: 16px;
          font-size: 0.83rem;
          line-height: 1.6;
          word-break: break-word;
        }
        .bot-bubble {
          background: var(--bg-card, rgba(30,41,59,0.96));
          border: 1px solid var(--border, rgba(255,255,255,0.08));
          color: var(--text-main, #e2e8f0);
          border-top-left-radius: 4px;
          backdrop-filter: blur(8px);
        }
        .user-bubble {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #fff;
          border-top-right-radius: 4px;
          box-shadow: 0 2px 12px rgba(34,197,94,0.28);
        }

        /* ── Message Meta (time + copy) ─────────────────────────────── */
        .chat-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 3px;
        }
        .meta-left  { justify-content: flex-start; padding-left: 2px; }
        .meta-right { justify-content: flex-end; padding-right: 2px; }
        .chat-time { font-size: 0.65rem; color: var(--text-muted, rgba(255,255,255,0.3)); }
        .chat-copy-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.72rem;
          color: var(--text-muted, rgba(255,255,255,0.3));
          padding: 0 2px;
          transition: color 0.15s;
          line-height: 1;
        }
        .chat-copy-btn:hover { color: #22c55e; }

        /* ── Markdown styles ────────────────────────────────────────── */
        .chat-bullet-line {
          display: flex;
          gap: 5px;
          padding-left: 2px;
          align-items: flex-start;
        }
        .chat-bullet-icon { color: #22c55e; flex-shrink: 0; }
        .chat-numbered-line {
          display: flex;
          gap: 6px;
          align-items: flex-start;
        }
        .chat-num { color: #22c55e; font-weight: 700; flex-shrink: 0; min-width: 18px; }
        .chat-heading {
          font-weight: 700;
          font-size: 0.88rem;
          color: #22c55e;
          margin: 4px 0 2px;
        }
        .chat-spacer { height: 5px; }
        .chat-code-line {
          font-family: 'Courier New', monospace;
          background: rgba(0,0,0,0.3);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.78rem;
          color: #86efac;
        }
        .chat-inline-code {
          font-family: 'Courier New', monospace;
          background: rgba(34,197,94,0.15);
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 0.78rem;
          color: #86efac;
        }
        .chat-source-badge {
          margin-top: 6px;
          font-size: 0.64rem;
          color: rgba(255,255,255,0.4);
        }

        /* ── Typing Indicator ───────────────────────────────────────── */
        .chat-typing-indicator {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 11px 15px;
          background: var(--bg-card, rgba(30,41,59,0.96));
          border: 1px solid var(--border, rgba(255,255,255,0.08));
          border-radius: 16px;
          border-top-left-radius: 4px;
          width: fit-content;
        }
        .chat-typing-indicator span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
          animation: typingDot 1.2s ease-in-out infinite;
        }
        .chat-typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .chat-typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typingDot {
          0%, 100% { transform: translateY(0); opacity: 0.35; }
          50%       { transform: translateY(-6px); opacity: 1; }
        }

        /* ── Sensor Panel ───────────────────────────────────────────── */
        .chat-sensor-panel {
          padding: 10px 14px;
          background: var(--bg-card, rgba(15,23,42,0.98));
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.07));
          flex-shrink: 0;
          animation: slideDown 0.25s ease;
        }
        .chat-sensor-panel-title {
          font-size: 0.68rem;
          color: var(--text-muted, rgba(255,255,255,0.4));
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .chat-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          animation: pulseOnline 2s infinite;
        }
        .chat-sensor-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 7px;
        }
        .chat-sensor-card {
          border-radius: 8px;
          padding: 6px 5px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          transition: background 0.2s;
        }
        .chat-sensor-card.sensor-ok  { border-color: rgba(34,197,94,0.3);  background: rgba(34,197,94,0.06); }
        .chat-sensor-card.sensor-warn { border-color: rgba(239,68,68,0.4); background: rgba(239,68,68,0.07); }
        .chat-sensor-card.sensor-info { border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.05); }
        .chat-sensor-card.sensor-null { opacity: 0.5; }
        .sensor-icon  { font-size: 13px; }
        .sensor-label { font-size: 0.6rem; color: var(--text-muted, rgba(255,255,255,0.4)); text-transform: uppercase; letter-spacing: 0.04em; }
        .sensor-value { font-size: 0.78rem; font-weight: 700; color: var(--text-main, #e2e8f0); }
        .sensor-ok  .sensor-value { color: #4ade80; }
        .sensor-warn .sensor-value { color: #f87171; }

        .chat-ml-row { display: flex; flex-wrap: wrap; gap: 5px; }
        .chat-ml-badge {
          font-size: 0.64rem;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .badge-ok   { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.25); }
        .badge-warn { background: rgba(239,68,68,0.15);  color: #f87171; border: 1px solid rgba(239,68,68,0.3); }

        /* ── Suggestions ────────────────────────────────────────────── */
        .chat-suggestions {
          padding: 8px 14px 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          background: var(--bg-main, #0f172a);
          flex-shrink: 0;
        }
        .chat-suggestion-chip {
          padding: 5px 11px;
          border-radius: 20px;
          border: 1px solid rgba(34,197,94,0.3);
          background: rgba(34,197,94,0.06);
          color: #4ade80;
          font-size: 0.72rem;
          cursor: pointer;
          transition: all 0.16s;
          white-space: nowrap;
          font-family: inherit;
        }
        .chat-suggestion-chip:hover {
          background: rgba(34,197,94,0.16);
          border-color: rgba(34,197,94,0.6);
          transform: translateY(-1px);
          box-shadow: 0 3px 10px rgba(34,197,94,0.15);
        }
        .chat-suggestion-chip:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Input Area ─────────────────────────────────────────────── */
        .chat-input-area {
          padding: 10px 13px;
          background: var(--bg-card, rgba(18,28,46,0.99));
          border-top: 1px solid var(--border, rgba(255,255,255,0.07));
          display: flex;
          gap: 8px;
          align-items: flex-end;
          flex-shrink: 0;
        }
        .chat-input {
          flex: 1;
          padding: 9px 13px;
          border-radius: 12px;
          border: 1.5px solid var(--border, rgba(255,255,255,0.1));
          background: var(--bg-muted, rgba(255,255,255,0.05));
          color: var(--text-main, #e2e8f0);
          font-size: 0.83rem;
          resize: none;
          font-family: inherit;
          line-height: 1.45;
          transition: border-color 0.2s, box-shadow 0.2s;
          min-height: 38px;
          max-height: 100px;
          overflow-y: auto;
          outline: none;
        }
        .chat-input:focus {
          border-color: #22c55e;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.1);
        }
        .chat-input::placeholder { color: var(--text-muted, rgba(255,255,255,0.3)); }

        .chat-send-btn {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          border: none;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
          transition: transform 0.18s, box-shadow 0.18s;
          flex-shrink: 0;
          box-shadow: 0 2px 12px rgba(34,197,94,0.35);
        }
        .chat-send-btn:hover:not(:disabled) {
          transform: scale(1.08);
          box-shadow: 0 4px 20px rgba(34,197,94,0.5);
        }
        .chat-send-btn:disabled {
          background: var(--bg-muted, rgba(255,255,255,0.1));
          box-shadow: none;
          cursor: default;
          opacity: 0.5;
        }

        .chat-footer-hint {
          text-align: center;
          font-size: 0.62rem;
          color: var(--text-muted, rgba(255,255,255,0.27));
          padding: 4px 14px 8px;
          background: var(--bg-card, rgba(18,28,46,0.99));
          flex-shrink: 0;
        }

        /* ── Light theme ────────────────────────────────────────────── */
        [data-theme="light"] .chat-messages { background: #f1f5f9; }
        [data-theme="light"] .bot-bubble { background: #fff; border-color: rgba(0,0,0,0.08); color: #1e293b; }
        [data-theme="light"] .chat-input-area,
        [data-theme="light"] .chat-footer-hint { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .chat-input { background: #f8fafc; color: #1e293b; border-color: rgba(0,0,0,0.14); }
        [data-theme="light"] .chat-suggestions { background: #f1f5f9; }
        [data-theme="light"] .chat-typing-indicator { background: #fff; border-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .chat-sensor-panel { background: #f8fafc; border-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .chat-sensor-card { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.07); }
        [data-theme="light"] .sensor-value { color: #1e293b; }
        [data-theme="light"] .chat-code-line { background: rgba(0,0,0,0.06); color: #15803d; }
        [data-theme="light"] .chat-inline-code { background: rgba(34,197,94,0.1); color: #15803d; }
        [data-theme="light"] .chat-proactive-banner { background: rgba(34,197,94,0.08); color: #15803d; }

        @media (max-width: 480px) {
          .chatbot-panel { right: 10px; bottom: 90px; width: calc(100vw - 20px); height: calc(100vh - 140px); }
          .chatbot-fab   { right: 14px; bottom: 18px; }
          .chat-sensor-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {/* ── Floating Action Button ──────────────────────────────────────────── */}
      <button
        id="chatbot-fab"
        className="chatbot-fab"
        onClick={() => setOpen(o => !o)}
        title="Open GreenSense AI Assistant"
        aria-label="Toggle AI Chatbot"
      >
        {!open && <span className="chatbot-fab-pulse" />}
        {hasUnread && !open && <span className="chatbot-unread-dot">!</span>}
        {open ? '✕' : '🌿'}
      </button>

      {/* ── Chat Panel ─────────────────────────────────────────────────────── */}
      <div
        className={`chatbot-panel ${open ? 'open' : 'closed'}`}
        id="chatbot-panel"
        role="dialog"
        aria-label="GreenSense AI Assistant"
      >
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-avatar">🌿</div>
          <div className="chat-header-info">
            <div className="chat-header-title">GreenSense AI</div>
            <div className="chat-header-sub">
              <span className="chat-online-dot" />
              LLM-powered · Live data connected
            </div>
          </div>
          <div className="chat-header-actions">
            <button
              className={`chat-icon-btn ${showSensorPanel ? 'active' : ''}`}
              onClick={() => setShowSensorPanel(s => !s)}
              title="Toggle live sensor panel"
              id="chatbot-sensor-btn"
            >
              📡
            </button>
            <button
              className="chat-icon-btn"
              onClick={clearChat}
              title="Clear chat"
              id="chatbot-clear-btn"
            >
              🗑
            </button>
            <button
              className="chat-icon-btn"
              onClick={() => setOpen(false)}
              title="Close"
              id="chatbot-close-btn"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Proactive Insight Banner */}
        {proactiveInsight && (
          <div className="chat-proactive-banner" id="chatbot-proactive-banner">
            <span>{proactiveInsight}</span>
          </div>
        )}

        {/* Live Sensor Panel (toggleable) */}
        {showSensorPanel && <LiveSensorPanel snapshot={snapshot} />}

        {/* Messages */}
        <div className="chat-messages" id="chat-messages-container">
          {messages.map(msg => (
            <ChatMessage key={msg.id} msg={msg} />
          ))}
          {isLoading && (
            <div className="chat-message-row bot">
              <div className="chat-avatar bot-avatar">🌿</div>
              <TypingIndicator />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick suggestion chips */}
        {showSuggestions && (
          <div className="chat-suggestions" id="chat-suggestions-container">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="chat-suggestion-chip"
                onClick={() => sendMessage(s.message)}
                id={`chat-suggestion-${i}`}
                disabled={isLoading}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="chat-input-area">
          <textarea
            ref={inputRef}
            id="chat-input"
            className="chat-input"
            placeholder="Ask about live data, trends, anomalies, decisions…"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
            aria-label="Chat message input"
          />
          <button
            id="chat-send-btn"
            className="chat-send-btn"
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isLoading}
            aria-label="Send message"
            title="Send (Enter)"
          >
            ➤
          </button>
        </div>

        <div className="chat-footer-hint">
          Enter to send · Shift+Enter for newline · 📡 connects to live Firebase data
        </div>
      </div>
    </>
  );
}
