import React, { useState } from 'react';
import {
  Bell, RefreshCw, Sliders, ShieldCheck, Wifi, Cpu,
  Smartphone, ChevronRight, Save, CheckCircle
} from 'lucide-react';

/* ─── Toast ─── */
const Toast = ({ msg, onClose }) => (
  <div className="toast-container" style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999 }}>
    <div className="toast">
      <CheckCircle size={18} color="var(--brand-green)" />
      {msg}
    </div>
  </div>
);

/* ─── Toggle Row ─── */
const ToggleRow = ({ icon: Icon, title, desc, checked, onChange }) => (
  <div className="setting-row">
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div className="insight-icon-wrap" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', width: 38, height: 38, borderRadius: 10 }}>
        <Icon size={17} color="var(--text-secondary)" />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{title}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="toggle-slider" />
    </label>
  </div>
);

/* ─── Threshold Editor ─── */
const ThresholdRow = ({ sensor, unit, minVal, maxVal, onMinChange, onMaxChange }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 0', borderBottom: '1px solid var(--border)'
  }}>
    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{sensor}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', flex: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Min Alert</div>
        <input
          type="number"
          className="threshold-input"
          value={minVal}
          onChange={e => onMinChange(e.target.value)}
        />
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{unit}</div>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, margin: '0 4px' }}>—</div>
      <div style={{ display: 'flex', flex: 'column', alignItems: 'center', gap: 4, textAlign: 'center' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Max Alert</div>
        <input
          type="number"
          className="threshold-input"
          value={maxVal}
          onChange={e => onMaxChange(e.target.value)}
        />
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{unit}</div>
      </div>
    </div>
  </div>
);

/* ─── Main ─── */
const Settings = () => {
  const [toggles, setToggles] = useState({
    smartAlerts: true,
    highPrecision: false,
    calibrationLock: true,
    autoWater: false,
  });

  const [thresholds, setThresholds] = useState({
    soil:  { min: 30, max: 80 },
    temp:  { min: 18, max: 32 },
    hum:   { min: 35, max: 75 },
    light: { min: 20, max: 90 },
  });

  const [toast, setToast] = useState(null);

  const toggle = (key) => setToggles(t => ({ ...t, [key]: !t[key] }));

  const updateThreshold = (sensor, side, val) => {
    setThresholds(t => ({ ...t, [sensor]: { ...t[sensor], [side]: Number(val) } }));
  };

  const saveSettings = () => {
    // Persist to localStorage
    localStorage.setItem('ps-toggles',    JSON.stringify(toggles));
    localStorage.setItem('ps-thresholds', JSON.stringify(thresholds));
    setToast('Settings saved successfully!');
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <>
      <header className="top-bar">
        <div>
          <h1>Settings</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Configure system behaviour and greenhouse device preferences
          </p>
        </div>
        <button
          onClick={saveSettings}
          className="sidebar-item"
          style={{
            width: 'auto', gap: 8, padding: '10px 20px',
            background: 'var(--brand-green)', color: 'white', border: 'none',
            fontSize: '0.88rem', fontWeight: 700, borderRadius: 10,
            boxShadow: '0 2px 8px rgba(34,197,94,0.3)'
          }}
        >
          <Save size={16} /> Save Settings
        </button>
      </header>

      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* System config */}
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 4 }}>System Configuration</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 20 }}>
                Control greenhouse automation and monitoring behaviour
              </p>

              <ToggleRow
                icon={Bell} title="Smart Alerts"
                desc="Push notifications for critical sensor threshold breaches"
                checked={toggles.smartAlerts}
                onChange={() => toggle('smartAlerts')}
              />
              <ToggleRow
                icon={Sliders} title="High Precision Mode"
                desc="Enable 12-bit ADC readings for increased sensor accuracy"
                checked={toggles.highPrecision}
                onChange={() => toggle('highPrecision')}
              />
              <ToggleRow
                icon={ShieldCheck} title="Calibration Lock"
                desc="Prevent accidental changes to sensor calibration values"
                checked={toggles.calibrationLock}
                onChange={() => toggle('calibrationLock')}
              />
              <ToggleRow
                icon={RefreshCw} title="Auto-Watering"
                desc="Automatically turn on the water pump when soil is dry"
                checked={toggles.autoWater}
                onChange={() => toggle('autoWater')}
              />
            </div>

            {/* Alert thresholds */}
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 4 }}>Alert Thresholds</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 20 }}>
                Customise the min/max values that trigger alerts for each sensor
              </p>

              <ThresholdRow
                sensor="🌱 Soil Moisture" unit="%"
                minVal={thresholds.soil.min} maxVal={thresholds.soil.max}
                onMinChange={v => updateThreshold('soil', 'min', v)}
                onMaxChange={v => updateThreshold('soil', 'max', v)}
              />
              <ThresholdRow
                sensor="🌡️ Temperature" unit="°C"
                minVal={thresholds.temp.min} maxVal={thresholds.temp.max}
                onMinChange={v => updateThreshold('temp', 'min', v)}
                onMaxChange={v => updateThreshold('temp', 'max', v)}
              />
              <ThresholdRow
                sensor="💧 Humidity" unit="%"
                minVal={thresholds.hum.min} maxVal={thresholds.hum.max}
                onMinChange={v => updateThreshold('hum', 'min', v)}
                onMaxChange={v => updateThreshold('hum', 'max', v)}
              />
              <ThresholdRow
                sensor="☀️ Light Intensity" unit="%"
                minVal={thresholds.light.min} maxVal={thresholds.light.max}
                onMinChange={v => updateThreshold('light', 'min', v)}
                onMaxChange={v => updateThreshold('light', 'max', v)}
              />
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Data sync */}
            <div className="card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 16 }}>Data Sync</h3>
              <div className="setting-row" style={{ padding: '12px 0' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="insight-icon-wrap" style={{ background: 'var(--brand-green-soft)', color: 'var(--brand-green)', width: 34, height: 34, borderRadius: 9 }}>
                    <RefreshCw size={15} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Update Frequency</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Auto-fetch interval</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
                  5s <ChevronRight size={14} />
                </div>
              </div>
            </div>

            {/* Active hardware */}
            <div className="card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 16 }}>Active Hardware</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="insight-item">
                  <div className="insight-icon-wrap" style={{ background: 'var(--brand-blue-soft)', color: 'var(--brand-blue)', width: 34, height: 34, borderRadius: 9 }}>
                    <Cpu size={15} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>ESP32-FLORA-S2</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>48:E7:29:B1:C0 · Online</div>
                  </div>
                </div>
                <div className="insight-item">
                  <div className="insight-icon-wrap" style={{ background: 'var(--brand-amber-soft)', color: 'var(--brand-amber)', width: 34, height: 34, borderRadius: 9 }}>
                    <Smartphone size={15} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>Firmware v2.4.1</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Latest security patch applied</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Network */}
            <div className="card" style={{ background: 'var(--brand-green-soft)', borderColor: 'transparent' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 12, color: 'var(--brand-green)' }}>Network Signal</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Wifi size={30} color="var(--brand-green)" />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--brand-green)' }}>-42 dBm</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--brand-green)', fontWeight: 600 }}>Excellent Connection</div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                {/* Signal bar visual */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 24 }}>
                  {[30, 50, 70, 90, 100].map((h, i) => (
                    <div key={i} style={{ flex: 1, height: `${h}%`, background: 'var(--brand-green)', borderRadius: '2px 2px 0 0', opacity: 0.6 + i * 0.08 }} />
                  ))}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--brand-green)', marginTop: 4, fontWeight: 600 }}>
                  Connected to Firebase · Asia Southeast 1
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </>
  );
};

export default Settings;
