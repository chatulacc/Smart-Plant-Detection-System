import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import SensorDetail from './components/SensorDetail';
import History from './components/History';
import Settings from './components/Settings';
import Notifications from './components/Notifications';
import {
  LayoutDashboard, Droplets, Thermometer, Wind, Sun,
  History as HistoryIcon, Settings as SettingsIcon,
  Leaf, Bell, User, Moon, Sun as SunIcon, Menu, X, Wifi, WifiOff
} from 'lucide-react';
import './index.css';

const API_URL = "https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app/plant.json";

// Utility: generate alert events from sensor data
function generateAlerts(data) {
  const alerts = [];
  if (!data || !data.length) return alerts;
  const latest = data[0];

  if (latest.soil_moisture !== null) {
    if (latest.soil_moisture < 30)
      alerts.push({ id: 'soil-dry', type: 'critical', msg: 'Soil moisture critically low — watering needed immediately.', sensor: 'Soil Moisture', ts: latest.timestamp });
    else if (latest.soil_moisture > 85)
      alerts.push({ id: 'soil-wet', type: 'warning', msg: 'Soil is too wet — risk of root rot. Hold off on watering.', sensor: 'Soil Moisture', ts: latest.timestamp });
  }
  if (latest.air_temperature !== null) {
    if (latest.air_temperature > 35)
      alerts.push({ id: 'temp-high', type: 'critical', msg: `Temperature is ${latest.air_temperature?.toFixed(1)}°C — heat stress risk for plants.`, sensor: 'Temperature', ts: latest.timestamp });
    else if (latest.air_temperature < 15)
      alerts.push({ id: 'temp-low', type: 'warning', msg: `Temperature is ${latest.air_temperature?.toFixed(1)}°C — too cold for growth.`, sensor: 'Temperature', ts: latest.timestamp });
  }
  if (latest.air_humidity !== null) {
    if (latest.air_humidity < 30)
      alerts.push({ id: 'hum-low', type: 'warning', msg: 'Humidity below 30% — plants may dry out. Consider a humidifier.', sensor: 'Humidity', ts: latest.timestamp });
    else if (latest.air_humidity > 80)
      alerts.push({ id: 'hum-high', type: 'info', msg: 'High humidity detected — ensure ventilation to prevent fungal growth.', sensor: 'Humidity', ts: latest.timestamp });
  }
  if (latest.ldr_light !== null) {
    if (latest.ldr_light < 20)
      alerts.push({ id: 'light-low', type: 'warning', msg: 'Light intensity very low — photosynthesis may be affected.', sensor: 'Light', ts: latest.timestamp });
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

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ps-theme', theme);
  }, [theme]);

  const normalize = (value) => ({
    air_temperature: value.temperature ?? value.air_temperature ?? value.temp ?? null,
    air_humidity: value.humidity ?? value.air_humidity ?? null,
    soil_moisture: value.soil ?? value.soil_moisture ?? value.moisture ?? null,
    ldr_light: value.ldr ?? value.ldr_light ?? value.light ?? null,
    timestamp: value.timestamp ?? value.time ?? new Date().toISOString()
  });

  const fetchData = useCallback(async () => {
    try {
      const response = await axios.get(API_URL);
      const firebaseData = response.data;
      setIsOnline(true);

      if (firebaseData && typeof firebaseData === 'object' && Object.keys(firebaseData).length > 0) {
        let sensorArray = [];
        const isFlatReading = 'temperature' in firebaseData || 'humidity' in firebaseData || 'soil' in firebaseData || 'ldr' in firebaseData;
        if (isFlatReading) {
          sensorArray = [normalize(firebaseData)];
        } else {
          sensorArray = Object.entries(firebaseData)
            .filter(([, value]) => value && typeof value === 'object')
            .map(([, value]) => normalize(value));
        }
        sensorArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const sliced = sensorArray.slice(0, 50);
        setData(sliced);
        setAlerts(generateAlerts(sliced));
        setLastUpdated(new Date());
      } else {
        const mockData = generateMockData();
        setData(mockData);
        setAlerts(generateAlerts(mockData));
        setLastUpdated(new Date());
      }
      setLoading(false);
    } catch {
      setIsOnline(false);
      const mockData = generateMockData();
      setData(mockData);
      setAlerts(generateAlerts(mockData));
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

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
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const markAllRead = () => {
    const ids = alerts.map(a => a.id);
    setReadAlerts(ids);
    localStorage.setItem('ps-read-alerts', JSON.stringify(ids));
  };

  const unreadCount = alerts.filter(a => !readAlerts.includes(a.id)).length;

  const latest = data.length > 0 ? data[0] : { soil_moisture: null, air_temperature: null, air_humidity: null, ldr_light: null };

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
        {activePage === 'overview' && <Dashboard data={data} latest={latest} loading={loading} />}

        {activePage === 'soil' && (
          <SensorDetail
            type="Soil Moisture" value={latest.soil_moisture} unit="%"
            data={data} metricKey="soil_moisture"
            color="var(--brand-green)" min={0} max={100}
          />
        )}
        {activePage === 'temp' && (
          <SensorDetail
            type="Temperature" value={latest.air_temperature} unit="°C"
            data={data} metricKey="air_temperature"
            color="var(--brand-amber)" min={0} max={50}
          />
        )}
        {activePage === 'hum' && (
          <SensorDetail
            type="Humidity" value={latest.air_humidity} unit="%"
            data={data} metricKey="air_humidity"
            color="var(--brand-blue)" min={0} max={100}
          />
        )}
        {activePage === 'light' && (
          <SensorDetail
            type="Light Intensity" value={latest.ldr_light} unit="%"
            data={data} metricKey="ldr_light"
            color="var(--brand-yellow)" min={0} max={100}
          />
        )}

        {activePage === 'notifications' && (
          <Notifications alerts={alerts} readAlerts={readAlerts} setReadAlerts={setReadAlerts} onMarkAll={markAllRead} />
        )}
        {activePage === 'history' && <History />}
        {activePage === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default App;
