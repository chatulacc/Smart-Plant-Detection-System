import React, { useState } from 'react';
import {
  Bell, AlertCircle, AlertTriangle, Info, CheckCircle, Trash2, CheckCheck, Leaf
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ICON_MAP = {
  critical: { Icon: AlertCircle,  cls: 'sev-critical' },
  warning:  { Icon: AlertTriangle, cls: 'sev-warning' },
  info:     { Icon: Info,          cls: 'sev-info' },
  ok:       { Icon: CheckCircle,   cls: 'sev-ok' },
};

const Notifications = ({ alerts, readAlerts, setReadAlerts, onMarkAll }) => {
  const [dismissed, setDismissed] = useState([]);

  const markRead = (id) => {
    const next = [...readAlerts, id];
    setReadAlerts(next);
    localStorage.setItem('ps-read-alerts', JSON.stringify(next));
  };

  const dismiss = (id) => {
    setDismissed(d => [...d, id]);
  };

  const visible = alerts.filter(a => !dismissed.includes(a.id));
  const unread  = visible.filter(a => !readAlerts.includes(a.id)).length;

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const sensorIcon = (sensor) => {
    if (!sensor) return <Bell size={18} />;
    if (sensor.includes('Soil'))  return '🌱';
    if (sensor.includes('Temp'))  return '🌡️';
    if (sensor.includes('Humid')) return '💧';
    if (sensor.includes('Light')) return '☀️';
    return '📡';
  };

  return (
    <>
      <header className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h1>Alerts & Notifications</h1>
          {unread > 0 && (
            <span className="status-badge sev-critical">{unread} unread</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {unread > 0 && (
            <button
              className="sidebar-item"
              style={{ width: 'auto', gap: 8, border: '1px solid var(--border)', background: 'var(--bg-muted)' }}
              onClick={onMarkAll}
            >
              <CheckCheck size={15} /> Mark All Read
            </button>
          )}
          {dismissed.length < alerts.length && alerts.length > 0 && (
            <button
              className="sidebar-item"
              style={{ width: 'auto', gap: 8, border: '1px solid var(--brand-red)', color: 'var(--brand-red)', background: 'var(--brand-red-soft)' }}
              onClick={() => setDismissed(alerts.map(a => a.id))}
            >
              <Trash2 size={15} /> Clear All
            </button>
          )}
        </div>
      </header>

      <div className="page-content">
        {visible.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card"
          >
            <div className="empty-state" style={{ padding: '80px 20px' }}>
              <div style={{ position: 'relative' }}>
                <Leaf size={56} color="var(--brand-green)" style={{ opacity: 0.3 }} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                All Clear! 🌿
              </h3>
              <p style={{ color: 'var(--text-muted)' }}>
                Your greenhouse is running smoothly. No alerts at the moment.
                Sensor readings are within healthy thresholds.
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="notif-list">
            <AnimatePresence>
              {visible.map((alert) => {
                const { Icon, cls } = ICON_MAP[alert.type] || ICON_MAP.info;
                const isRead = readAlerts.includes(alert.id);
                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 60, scale: 0.95 }}
                    transition={{ duration: 0.25 }}
                    className={`notif-item ${isRead ? 'read' : `unread ${alert.type}`}`}
                    onClick={() => !isRead && markRead(alert.id)}
                  >
                    {/* Severity icon */}
                    <div
                      className="insight-icon-wrap"
                      style={{
                        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                        background: cls === 'sev-critical' ? 'var(--brand-red-soft)'
                          : cls === 'sev-warning' ? 'var(--brand-amber-soft)'
                          : 'var(--brand-blue-soft)',
                        color: cls === 'sev-critical' ? 'var(--brand-red)'
                          : cls === 'sev-warning' ? 'var(--brand-amber)'
                          : 'var(--brand-blue)',
                      }}
                    >
                      <Icon size={20} />
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span className={`notif-severity ${cls}`}>{alert.type.toUpperCase()}</span>
                        {alert.sensor && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {sensorIcon(alert.sensor)} {alert.sensor}
                          </span>
                        )}
                        {!isRead && (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-green)', display: 'inline-block', marginLeft: 'auto' }} />
                        )}
                      </div>
                      <p style={{ fontSize: '0.88rem', fontWeight: isRead ? 400 : 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {alert.msg}
                      </p>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {formatDate(alert.ts)}
                        {!isRead && <span style={{ marginLeft: 8, color: 'var(--brand-green)', fontWeight: 700 }}>· Click to mark as read</span>}
                      </div>
                    </div>

                    {/* Dismiss */}
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(alert.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6, flexShrink: 0 }}
                      title="Dismiss"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Summary card */}
        {alerts.length > 0 && visible.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
            style={{ marginTop: 20, padding: '16px 20px' }}
          >
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[
                { label: 'Critical', type: 'critical', cls: 'sev-critical' },
                { label: 'Warnings', type: 'warning',  cls: 'sev-warning' },
                { label: 'Info',     type: 'info',     cls: 'sev-info' },
              ].map(({ label, type, cls }) => {
                const count = alerts.filter(a => a.type === type).length;
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`status-badge ${cls}`}>{count}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
                  </div>
                );
              })}
              <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                {readAlerts.length} of {alerts.length} read
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </>
  );
};

export default Notifications;
