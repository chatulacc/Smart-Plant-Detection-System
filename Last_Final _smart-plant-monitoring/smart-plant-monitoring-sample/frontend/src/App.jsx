import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import SensorDetail from './components/SensorDetail';
import History from './components/History';
import Settings from './components/Settings';
import Notifications from './components/Notifications';
import Analytics from './components/Analytics';
import {
  LayoutDashboard, Droplets, Thermometer, Wind, Sun,
  History as HistoryIcon, Settings as SettingsIcon,
  Leaf, Bell, User, Moon, Sun as SunIcon, Menu, X, Wifi, WifiOff, Cpu
} from 'lucide-react';
import './index.css';

const API_URL = "https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app/plant.json";

// Utility: generate alert events from sensor data
function generateAlerts(data, thresholds, aiInsights) {
  const alerts = [];
  if (!data || !data.length) return alerts;
  const latest = data[0];

  const T_SOIL = thresholds?.soil || { min: 307, max: 716 };
  const T_TEMP = thresholds?.temp || { min: 18, max: 35 };
  const T_HUM  = thresholds?.hum  || { min: 30, max: 80 };
  const T_LIGHT = thresholds?.light || { min: 410, max: 920 };

  // ─── 1. STANDARD THRESHOLD ALERTS ───
  if (latest.soil_moisture !== null) {
    if (latest.soil_moisture < T_SOIL.min)
      alerts.push({ id: `soil-dry-${latest.timestamp}`, type: 'critical', msg: `Soil moisture low (${latest.soil_moisture}) — under ${T_SOIL.min}.`, sensor: 'Soil Moisture', ts: latest.timestamp });
    else if (latest.soil_moisture > T_SOIL.max)
      alerts.push({ id: `soil-wet-${latest.timestamp}`, type: 'warning', msg: `Soil is too wet (${latest.soil_moisture}) — over ${T_SOIL.max}.`, sensor: 'Soil Moisture', ts: latest.timestamp });
  }
  if (latest.air_temperature !== null) {
    if (latest.air_temperature > T_TEMP.max)
      alerts.push({ id: `temp-high-${latest.timestamp}`, type: 'critical', msg: `Temp is ${latest.air_temperature?.toFixed(1)}°C — over ${T_TEMP.max}°C.`, sensor: 'Temperature', ts: latest.timestamp });
    else if (latest.air_temperature < T_TEMP.min)
      alerts.push({ id: `temp-low-${latest.timestamp}`, type: 'warning', msg: `Temp is ${latest.air_temperature?.toFixed(1)}°C — under ${T_TEMP.min}°C.`, sensor: 'Temperature', ts: latest.timestamp });
  }
  if (latest.air_humidity !== null) {
    if (latest.air_humidity < T_HUM.min)
      alerts.push({ id: `hum-low-${latest.timestamp}`, type: 'warning', msg: `Humidity is ${latest.air_humidity?.toFixed(0)}% — under ${T_HUM.min}%.`, sensor: 'Humidity', ts: latest.timestamp });
    else if (latest.air_humidity > T_HUM.max)
      alerts.push({ id: `hum-high-${latest.timestamp}`, type: 'info', msg: `High humidity (${latest.air_humidity?.toFixed(0)}%) — over ${T_HUM.max}%.`, sensor: 'Humidity', ts: latest.timestamp });
  }

  // ─── 2. AI-POWERED SMART ALERTS ───
  if (aiInsights) {
    // A. Anomaly Detection (Isolation Forest)
    if (aiInsights.anomalies?.is_anomalous) {
      alerts.push({
        id: `ai-anomaly-${latest.timestamp}`,
        type: 'ai',
        msg: `🤖 AI ALERT: Unusual sensor patterns detected. Potential hardware interference or environment shift.`,
        sensor: 'AI Anomaly Engine',
        ts: latest.timestamp
      });
    }

    // B. Predictive Heat Stress (Regression Trend)
    const tempTrend = aiInsights.forecasting?.air_temperature_trend;
    if (tempTrend === 'rising' && latest.air_temperature > (T_TEMP.max - 2)) {
      alerts.push({
        id: `ai-predict-temp-${latest.timestamp}`,
        type: 'ai',
        msg: `🤖 AI PREDICTION: Rising temperature trend detected. Forecast shows limit exceeded in ~15 mins.`,
        sensor: 'AI Predictor',
        ts: latest.timestamp
      });
    }

    // C. Learned Refined Bounds (K-Means/Stats)
    const refined = aiInsights.refined_bounds;
    if (refined && latest.air_temperature) {
      const tb = refined.air_temperature;
      if (latest.air_temperature < tb.learned_min || latest.air_temperature > tb.learned_max) {
        alerts.push({
          id: `ai-refined-${latest.timestamp}`,
          type: 'ai',
          msg: `📝 AI INSIGHT: Temperature is outside the AI-learned "Perfect Zone" (${tb.learned_min}-${tb.learned_max}°C).`,
          sensor: 'AI Insights',
          ts: latest.timestamp
        });
      }
    }
  }

  return alerts;
}

function App() {
  const [activePage, setActivePage] = useState('overview');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('ps-theme') || 'light');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [readAlerts, setReadAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ps-read-alerts') || '[]'); } catch { return []; }
  });
  const [aiPrediction, setAiPrediction] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [thresholds, setThresholds] = useState(() => {
    try {
      const saved = localStorage.getItem('ps-thresholds');
      return saved ? JSON.parse(saved) : { soil: { min: 307, max: 716 }, temp: { min: 18, max: 35 }, hum: { min: 30, max: 80 }, light: { min: 410, max: 920 } };
    } catch {
      return { soil: { min: 307, max: 716 }, temp: { min: 18, max: 35 }, hum: { min: 30, max: 80 }, light: { min: 410, max: 920 } };
    }
  });

  // Watch for threshold changes in settings (simple event or re-fetch)
  const syncSettings = useCallback(() => {
    try {
      const saved = localStorage.getItem('ps-thresholds');
      if (saved) setThresholds(JSON.parse(saved));
    } catch (err) { console.error(err); }
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ps-theme', theme);
  }, [theme]);

  const normalize = (value) => {
    const rawSoil = value.soil ?? value.soil_moisture ?? value.moisture ?? null;
    const rawLdr = value.ldr ?? value.ldr_light ?? value.light ?? null;

    // Calibration: Convert 12-bit (0-4095) to 10-bit (0-1023) if needed
    const calibrate = (val) => (val > 1023 ? (val / 4095) * 1023 : val);

    return {
      air_temperature: value.temperature ?? value.air_temperature ?? value.temp ?? null,
      air_humidity: value.humidity ?? value.air_humidity ?? null,
      soil_moisture: rawSoil !== null ? parseFloat(calibrate(rawSoil).toFixed(1)) : null,
      ldr_light: rawLdr !== null ? parseFloat(calibrate(rawLdr).toFixed(1)) : null,
      timestamp: value.timestamp ?? value.time ?? new Date().toISOString()
    };
  };

  const fetchAiInsights = useCallback(async () => {
    try {
      const resp = await axios.get('http://127.0.0.1:5000/api/ml-insights');
      setAiInsights(resp.data);
    } catch (err) {
      console.warn("AI Insights poller failed:", err.message);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const response = await axios.get(API_URL);
      const firebaseData = response.data;
      setIsOnline(true);

      if (firebaseData && typeof firebaseData === 'object' && Object.keys(firebaseData).length > 0) {
        // Accommodate nested push-style readings (e.g. plant.readings.{pushId: {...}})
        let source = firebaseData;
        if (firebaseData.readings && typeof firebaseData.readings === 'object') {
          source = firebaseData.readings;
        }

        let sensorArray = [];
        const isFlatReading = 'temperature' in source || 'humidity' in source || 'soil' in source || 'ldr' in source;
        if (isFlatReading) {
          sensorArray = [normalize(source)];
        } else {
          sensorArray = Object.entries(source)
            .filter(([, value]) => value && typeof value === 'object')
            .map(([, value]) => normalize(value));
        }

        sensorArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const sliced = sensorArray.slice(0, 20);
        setData(sliced);
        setAlerts(generateAlerts(sliced, thresholds, aiInsights));
        setLastUpdated(new Date());
      } else {
        const mockData = generateMockData();
        setData(mockData);
        setAlerts(generateAlerts(mockData, thresholds, aiInsights));
        setLastUpdated(new Date());
      }
      setLoading(false);
    } catch {
      setIsOnline(false);
      const mockData = generateMockData();
      setData(mockData);
      setAlerts(generateAlerts(mockData, thresholds, aiInsights));
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, [thresholds, aiInsights]);

  function generateMockData() {
    return Array.from({ length: 20 }, (_, i) => ({
      air_temperature: 26 + Math.sin(i * 0.3) * 4,
      air_humidity: 58 + Math.cos(i * 0.2) * 10,
      soil_moisture: 55 + Math.sin(i * 0.5) * 20,
      ldr_light: 60 + Math.cos(i * 0.3) * 20,
      timestamp: new Date(Date.now() - i * 30000).toISOString()
    }));
  }

  useEffect(() => {
    fetchData();
    fetchAiInsights(); // Initial AI pull
    const intervalData = setInterval(fetchData, 5000);
    const intervalAI = setInterval(fetchAiInsights, 15000); // AI every 15s
    return () => {
      clearInterval(intervalData);
      clearInterval(intervalAI);
    };
  }, [fetchData, fetchAiInsights]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const markAllRead = () => {
    const ids = alerts.map(a => a.id);
    setReadAlerts(ids);
    localStorage.setItem('ps-read-alerts', JSON.stringify(ids));
  };

  const unreadCount = alerts.filter(a => !readAlerts.includes(a.id)).length;

  const latest = data.length > 0 ? data[0] : { soil_moisture: null, air_temperature: null, air_humidity: null, ldr_light: null };

  // --- Auto-Watering Integration ---
  useEffect(() => {
    const handleAutoWatering = async () => {
      try {
        if (latest.soil_moisture === null || latest.air_temperature === null || latest.air_humidity === null) return;
        
        // 1. Get prediction from Python backend model ALWAYS
        const response = await axios.post('http://127.0.0.1:5000/api/predict-pump', {
          soil_moisture: latest.soil_moisture,
          temperature: latest.air_temperature,
          humidity: latest.air_humidity
        });
        
        const predictedState = response.data.prediction; // 1 (ON) or 0 (OFF)
        setAiPrediction({
          state: predictedState,
          confidence: response.data.confidence,
          status: response.data.status
        });
        
        // 2. Check if Auto-Watering is turned on before commanding physical hardware
        const toggles = JSON.parse(localStorage.getItem('ps-toggles') || '{}');
        if (!toggles.autoWater) return; 
        
        // 3. Update Firebase directly (updating both UI pump and generic motor paths)
        // Update plant/pump (used by Dashboard.jsx)
        await fetch(`https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app/plant/pump.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(predictedState)
        });
        
        // Update control/motor (used by ESP32 via backend routes)
        await fetch(`https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app/control/motor.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(predictedState)
        });
        
      } catch (err) {
        console.error("Auto-watering prediction or control failed:", err);
      }
    };

    handleAutoWatering();
  }, [latest.timestamp, latest.soil_moisture, latest.air_temperature, latest.air_humidity]);

  const navigate = (page) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  const NavItem = ({ id, label, icon: Icon, badge }) => (
    <button
      className={`sidebar-item ${activePage === id ? 'active' : ''}`}
      onClick={() => navigate(id)}
      id={`nav-${id}`}
    >
      <Icon size={17} />
      <span>{label}</span>
      {badge > 0 && <span className="nav-badge">{badge}</span>}
    </button>
  );

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--';

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{ display: 'block' }}
        />
      )}

      {/* ─── Sidebar ─── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <Leaf size={26} fill="currentColor" />
          <span className="logo-text">GreenSense</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Dashboard</div>
          <NavItem id="overview"       label="Overview"        icon={LayoutDashboard} />
          <NavItem id="soil"           label="Soil Moisture"   icon={Droplets} />
          <NavItem id="temp"           label="Temperature"     icon={Thermometer} />
          <NavItem id="hum"            label="Humidity"        icon={Wind} />
          <NavItem id="light"          label="Light Intensity" icon={Sun} />

          <div className="nav-label">Management</div>
          <NavItem id="notifications"  label="Alerts"          icon={Bell} badge={unreadCount} />
          <NavItem id="history"        label="History Logs"    icon={HistoryIcon} />
          <NavItem id="analytics"      label="AI Analytics"    icon={Cpu} />
          <NavItem id="settings"       label="Settings"        icon={SettingsIcon} />
        </nav>

        {/* Theme toggle */}
        <button className="theme-toggle-btn" onClick={toggleTheme}>
          {theme === 'light'
            ? <><Moon size={16} /> Dark Mode</>
            : <><SunIcon size={16} /> Light Mode</>
          }
        </button>

        {/* User */}
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">GH</div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>Greenhouse Admin</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>greenhouse@plantsense.io</div>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="main-content">
        {/* Top bar */}
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)}>
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h1>
              {activePage === 'overview'      && 'Overview'}
              {activePage === 'soil'          && 'Soil Moisture'}
              {activePage === 'temp'          && 'Temperature'}
              {activePage === 'hum'           && 'Humidity'}
              {activePage === 'light'         && 'Light Intensity'}
              {activePage === 'notifications' && 'Alerts & Notifications'}
              {activePage === 'history'       && 'Historical Logs'}
              {activePage === 'analytics'     && 'AI Analytics Engine'}
              {activePage === 'settings'      && 'Settings'}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="conn-badge">
              <span className={`connection-dot ${isOnline ? 'online' : 'offline'}`} />
              {isOnline ? 'Live' : 'Offline'} · {lastUpdatedStr}
            </div>
            <button
              className="sidebar-item"
              style={{
                width: 'auto', padding: '8px 14px', gap: '8px', position: 'relative',
                color: unreadCount > 0 ? 'var(--brand-red)' : 'var(--text-secondary)',
                background: unreadCount > 0 ? 'var(--brand-red-soft)' : 'var(--bg-muted)',
                border: '1px solid var(--border)'
              }}
              onClick={() => navigate('notifications')}
            >
              <Bell size={16} />
              {unreadCount > 0 && <span className="nav-badge" style={{ marginLeft: 0 }}>{unreadCount}</span>}
            </button>
          </div>
        </header>

        {/* Page content */}
        {activePage === 'overview' && (
          <Dashboard
            data={data}
            latest={latest}
            loading={loading}
            aiPrediction={aiPrediction}
            thresholds={thresholds}
          />
        )}

        {activePage === 'soil' && (
          <SensorDetail
            type="Soil Moisture" value={latest.soil_moisture} unit=""
            data={data} metricKey="soil_moisture"
            color="var(--brand-green)" min={0} max={1023}
            thresholds={thresholds}
          />
        )}
        {activePage === 'temp' && (
          <SensorDetail
            type="Temperature" value={latest.air_temperature} unit="°C"
            data={data} metricKey="air_temperature"
            color="var(--brand-amber)" min={0} max={50}
            thresholds={thresholds}
          />
        )}
        {activePage === 'hum' && (
          <SensorDetail
            type="Humidity" value={latest.air_humidity} unit="%"
            data={data} metricKey="air_humidity"
            color="var(--brand-blue)" min={0} max={100}
            thresholds={thresholds}
          />
        )}
        {activePage === 'light' && (
          <SensorDetail
            type="Light Intensity" value={latest.ldr_light} unit=""
            data={data} metricKey="ldr_light"
            color="var(--brand-yellow)" min={0} max={1023}
            thresholds={thresholds}
          />
        )}

        {activePage === 'notifications' && (
          <Notifications alerts={alerts} readAlerts={readAlerts} setReadAlerts={setReadAlerts} onMarkAll={markAllRead} />
        )}
        {activePage === 'history' && <History />}
        {activePage === 'analytics' && <Analytics />}
        {activePage === 'settings' && <Settings onSave={() => syncSettings()} />}
      </main>
    </div>
  );
}

export default App;
