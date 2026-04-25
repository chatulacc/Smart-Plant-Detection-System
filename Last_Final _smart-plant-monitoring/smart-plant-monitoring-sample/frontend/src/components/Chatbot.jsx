import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:5000/api';

// ── Quick suggestion chips shown in empty state ───────────────────────────────
const SUGGESTIONS = [
  { label: '🌱 What affects pump status?',       message: 'What factors influence pump status the most?' },
  { label: '📊 Soil moisture insights',           message: 'Tell me about soil moisture trends and statistics in the dataset.' },
  { label: '🌡️ Temperature analysis',             message: 'What does the dataset tell us about temperature patterns and their effect on irrigation?' },
  { label: '🔍 Explain anomalies',                message: 'How does anomaly detection work and what does it mean if an anomaly is flagged?' },
  { label: '🗺️ Guide me through the dashboard',   message: 'Can you guide me through all the pages of this dashboard?' },
  { label: '💧 Irrigation decision support',      message: 'Based on the current sensor readings, what irrigation action should I take?' },
  { label: '🧪 Dataset overview',                 message: 'Give me a full overview of the TARP dataset — what data does it contain?' },
  { label: '📈 Nutrient correlations (N, P, K)',  message: 'How do nitrogen, phosphorus, and potassium (N, P, K) relate to pump activation in the dataset?' },
];

function TypingIndicator() {
  return (
    <div className="chat-typing-indicator">
      <span /><span /><span />
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user';

  // Simple markdown: **bold**, *italic*, bullet lines
  const renderText = (text) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      // Replace **bold**
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j}>{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
        return <div key={i} className="chat-bullet-line">{parts}</div>;
      }
      if (line.trim() === '') return <div key={i} className="chat-spacer" />;
      return <div key={i}>{parts}</div>;
    });
  };

  return (
    <div className={`chat-message-row ${isUser ? 'user' : 'bot'}`}>
      {!isUser && (
        <div className="chat-avatar bot-avatar" title="GreenSense AI">
          🌿
        </div>
      )}
      <div className={`chat-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
        {renderText(msg.content)}
        {msg.source && msg.source !== 'gemini' && (
          <div className="chat-source-badge">⚡ Offline mode</div>
        )}
      </div>
      {isUser && (
        <div className="chat-avatar user-avatar" title="You">
          👤
        </div>
      )}
    </div>
  );
}

export default function Chatbot({ latest, aiInsights, activePage }) {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'bot',
      content:
        "Hello! I'm **GreenSense AI** 🌿 — your intelligent greenhouse assistant.\n\n" +
        "I can answer questions about your **sensor data**, **TARP dataset** insights, " +
        "**dashboard navigation**, and give you **irrigation recommendations**.\n\n" +
        "What would you like to know?",
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading]   = useState(false);
  const [hasUnread, setHasUnread]   = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const chatPanelRef   = useRef(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || inputValue).trim();
    if (!trimmed || isLoading) return;

    // Append user message
    const userMsg = { id: Date.now(), role: 'user', content: trimmed };
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

      // If AI insights are available, add key info
      if (aiInsights?.forecasting) {
        live_data['AI Temp Forecast (next)'] = aiInsights.forecasting.air_temperature;
        live_data['AI Temp Trend']           = aiInsights.forecasting.air_temperature_trend;
        live_data['AI Soil Forecast (next)'] = aiInsights.forecasting.soil_moisture;
      }
      if (aiInsights?.anomalies?.is_anomalous !== undefined) {
        live_data['AI Anomaly Detected'] = aiInsights.anomalies.is_anomalous ? 'YES' : 'NO';
      }

      const resp = await axios.post(`${API_BASE}/chat`, {
        message:     trimmed,
        live_data,
        active_page: activePage || 'overview',
      });

      const botMsg = {
        id:      Date.now() + 1,
        role:    'bot',
        content: resp.data.reply || 'I could not generate a response. Please try again.',
        source:  resp.data.source,
      };
      setMessages(prev => [...prev, botMsg]);

      // Signal unread if panel is closed
      if (!open) setHasUnread(true);

    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'bot',
          content:
            '⚠️ I had trouble connecting to the AI backend. Make sure the Python server is running on port 5000, then try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, latest, aiInsights, activePage, open]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestion = (msg) => sendMessage(msg);

  const clearChat = () => {
    setMessages([
      {
        id:      'welcome-reset',
        role:    'bot',
        content: "Chat cleared! I'm ready for your next question 🌿",
      },
    ]);
  };

  const showSuggestions = messages.length <= 1;

  return (
    <>
      {/* ── Styles (injected inline to keep component self-contained) ────── */}
      <style>{`
        /* ── FAB button ─────────────────────────────────────────── */
        .chatbot-fab {
          position: fixed;
          bottom: 28px;
          right: 28px;
          width: 62px;
          height: 62px;
          border-radius: 50%;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border: none;
          box-shadow: 0 4px 24px rgba(34, 197, 94, 0.45);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          transition: transform 0.2s, box-shadow 0.2s;
          z-index: 9999;
        }
        .chatbot-fab:hover {
          transform: scale(1.12);
          box-shadow: 0 6px 32px rgba(34, 197, 94, 0.6);
        }
        .chatbot-fab:active { transform: scale(0.95); }

        .chatbot-fab-pulse {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          background: rgba(34, 197, 94, 0.35);
          animation: fabPulse 2s ease-in-out infinite;
        }
        @keyframes fabPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50%       { transform: scale(1.25); opacity: 0; }
        }

        .chatbot-unread-dot {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ef4444;
          border: 2px solid #fff;
          animation: blink 1s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }

        /* ── Chat panel ─────────────────────────────────────────── */
        .chatbot-panel {
          position: fixed;
          bottom: 104px;
          right: 28px;
          width: 400px;
          max-width: calc(100vw - 40px);
          height: 580px;
          max-height: calc(100vh - 140px);
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255,255,255,0.08);
          z-index: 9998;
          transform-origin: bottom right;
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
        }
        .chatbot-panel.closed {
          transform: scale(0.85) translateY(20px);
          opacity: 0;
          pointer-events: none;
        }
        .chatbot-panel.open {
          transform: scale(1) translateY(0);
          opacity: 1;
        }

        /* ── Panel header ──────────────────────────────────────── */
        .chat-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 18px;
          background: linear-gradient(135deg, #166534 0%, #15803d 60%, #22c55e 100%);
          flex-shrink: 0;
        }
        .chat-header-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }
        .chat-header-info { flex: 1; min-width: 0; }
        .chat-header-title {
          font-weight: 700;
          font-size: 0.95rem;
          color: #fff;
          letter-spacing: 0.02em;
        }
        .chat-header-sub {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.75);
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
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .chat-header-actions { display: flex; gap: 6px; }
        .chat-icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: rgba(255,255,255,0.15);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: background 0.2s;
        }
        .chat-icon-btn:hover { background: rgba(255,255,255,0.28); }

        /* ── Messages area ─────────────────────────────────────── */
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: var(--bg-main, #0f172a);
          scrollbar-width: thin;
          scrollbar-color: rgba(34,197,94,0.3) transparent;
        }
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(34,197,94,0.3);
          border-radius: 4px;
        }

        /* ── Message rows ──────────────────────────────────────── */
        .chat-message-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          animation: msgIn 0.25s ease;
        }
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .chat-message-row.user { flex-direction: row-reverse; }

        .chat-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
        }
        .bot-avatar  { background: rgba(34,197,94,0.15); border: 1.5px solid rgba(34,197,94,0.3); }
        .user-avatar { background: rgba(99,102,241,0.15); border: 1.5px solid rgba(99,102,241,0.3); }

        .chat-bubble {
          max-width: 78%;
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 0.85rem;
          line-height: 1.55;
          word-break: break-word;
        }
        .bot-bubble {
          background: var(--bg-card, rgba(30,41,59,0.95));
          border: 1px solid var(--border, rgba(255,255,255,0.08));
          color: var(--text-main, #e2e8f0);
          border-bottom-left-radius: 4px;
          backdrop-filter: blur(8px);
        }
        .user-bubble {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #fff;
          border-bottom-right-radius: 4px;
          box-shadow: 0 2px 12px rgba(34,197,94,0.3);
        }

        .chat-bullet-line { padding-left: 4px; }
        .chat-spacer { height: 4px; }

        .chat-source-badge {
          margin-top: 6px;
          font-size: 0.68rem;
          color: rgba(255,255,255,0.45);
        }

        /* ── Typing indicator ──────────────────────────────────── */
        .chat-typing-indicator {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 12px 16px;
          background: var(--bg-card, rgba(30,41,59,0.95));
          border: 1px solid var(--border, rgba(255,255,255,0.08));
          border-radius: 16px;
          border-bottom-left-radius: 4px;
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
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50%       { transform: translateY(-5px); opacity: 1; }
        }

        /* ── Suggestions ───────────────────────────────────────── */
        .chat-suggestions {
          padding: 0 16px 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          background: var(--bg-main, #0f172a);
        }
        .chat-suggestion-chip {
          padding: 6px 12px;
          border-radius: 20px;
          border: 1px solid rgba(34,197,94,0.35);
          background: rgba(34,197,94,0.07);
          color: #22c55e;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.18s;
          white-space: nowrap;
        }
        .chat-suggestion-chip:hover {
          background: rgba(34,197,94,0.18);
          border-color: rgba(34,197,94,0.7);
          transform: translateY(-1px);
        }

        /* ── Input area ────────────────────────────────────────── */
        .chat-input-area {
          padding: 12px 16px;
          background: var(--bg-card, rgba(20,30,48,0.98));
          border-top: 1px solid var(--border, rgba(255,255,255,0.08));
          display: flex;
          gap: 10px;
          align-items: flex-end;
          flex-shrink: 0;
        }
        .chat-input {
          flex: 1;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1.5px solid var(--border, rgba(255,255,255,0.1));
          background: var(--bg-muted, rgba(255,255,255,0.05));
          color: var(--text-main, #e2e8f0);
          font-size: 0.85rem;
          resize: none;
          font-family: inherit;
          line-height: 1.4;
          transition: border-color 0.2s;
          min-height: 40px;
          max-height: 100px;
          overflow-y: auto;
          outline: none;
        }
        .chat-input:focus {
          border-color: #22c55e;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.12);
        }
        .chat-input::placeholder { color: var(--text-muted, rgba(255,255,255,0.35)); }

        .chat-send-btn {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          transition: transform 0.2s, box-shadow 0.2s;
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
          font-size: 0.66rem;
          color: var(--text-muted, rgba(255,255,255,0.3));
          padding: 0 16px 10px;
          background: var(--bg-card, rgba(20,30,48,0.98));
        }

        /* ── Light theme overrides ─────────────────────────────── */
        [data-theme="light"] .chat-messages { background: #f1f5f9; }
        [data-theme="light"] .bot-bubble {
          background: #fff;
          border-color: rgba(0,0,0,0.08);
          color: #1e293b;
        }
        [data-theme="light"] .chat-input-area { background: #fff; border-top-color: rgba(0,0,0,0.08); }
        [data-theme="light"] .chat-footer-hint { background: #fff; color: rgba(0,0,0,0.3); }
        [data-theme="light"] .chat-input { background: #f8fafc; color: #1e293b; border-color: rgba(0,0,0,0.15); }
        [data-theme="light"] .chat-suggestions { background: #f1f5f9; }
        [data-theme="light"] .chat-typing-indicator { background: #fff; border-color: rgba(0,0,0,0.08); }

        @media (max-width: 480px) {
          .chatbot-panel { right: 12px; bottom: 90px; width: calc(100vw - 24px); }
          .chatbot-fab   { right: 16px; bottom: 20px; }
        }
      `}</style>

      {/* ── Floating Action Button ────────────────────────────────────────── */}
      <button
        id="chatbot-fab"
        className="chatbot-fab"
        onClick={() => setOpen(o => !o)}
        title="Open GreenSense AI Assistant"
        aria-label="Toggle AI Chatbot"
      >
        {!open && <span className="chatbot-fab-pulse" />}
        {hasUnread && !open && <span className="chatbot-unread-dot" />}
        {open ? '✕' : '🌿'}
      </button>

      {/* ── Chat Panel ───────────────────────────────────────────────────── */}
      <div
        ref={chatPanelRef}
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
              online
            </div>
          </div>
          <div className="chat-header-actions">
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

        {/* Quick suggestion chips (shown only in empty state) */}
        {showSuggestions && (
          <div className="chat-suggestions">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="chat-suggestion-chip"
                onClick={() => handleSuggestion(s.message)}
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
            placeholder="Ask about sensor data, trends, or dashboard…"
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
          Press Enter to send · Shift+Enter for newline
        </div>
      </div>
    </>
  );
}
