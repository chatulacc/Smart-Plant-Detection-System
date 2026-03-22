import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import SensorDetail from './components/SensorDetail';
import History from './components/History';
import Settings from './components/Settings';
import { 
  LayoutDashboard, 
  Droplets, 
  Thermometer, 
  Wind, 
  Sun,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Leaf,
  Bell,
  User
} from 'lucide-react';
import './index.css';

const API_URL = "https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app/plant.json";

function App() {
  const [activePage, setActivePage] = useState('overview');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const response = await axios.get(API_URL);
      const firebaseData = response.data;
      console.log('Firebase data fetched:', firebaseData);
      
      if (firebaseData && typeof firebaseData === 'object' && Object.keys(firebaseData).length > 0) {
        // Convert Firebase object to array and map field names (support both flat single state and history map)
        const normalize = (value) => ({
          air_temperature: value.temperature ?? value.air_temperature ?? value.temp ?? null,
          air_humidity: value.humidity ?? value.air_humidity ?? null,
          soil_moisture: value.soil ?? value.soil_moisture ?? value.moisture ?? null,
          ldr_light: value.ldr ?? value.ldr_light ?? value.light ?? null,
          timestamp: value.timestamp ?? value.time ?? new Date().toISOString()
        });

        let sensorArray = [];
        const isFlatReading = 'temperature' in firebaseData || 'humidity' in firebaseData || 'soil' in firebaseData || 'ldr' in firebaseData;
        if (isFlatReading) {
          sensorArray = [normalize(firebaseData)];
        } else {
          sensorArray = Object.entries(firebaseData)
            .filter(([, value]) => value && typeof value === 'object')
            .map(([, value]) => normalize(value));
        }
        
        // Sort by timestamp (most recent first) and take latest 50
        sensorArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        console.log('Processed sensor array:', sensorArray.length, 'entries');
        setData(sensorArray.slice(0, 50));
      } else {
        console.log('No Firebase data available, using mock data');
        // Use mock data if Firebase is empty
        const mockData = [
          {
            air_temperature: 28.5,
            air_humidity: 65.2,
            soil_moisture: 3200,
            ldr_light: 1850,
            timestamp: new Date().toISOString()
          },
          {
            air_temperature: 28.2,
            air_humidity: 66.1,
            soil_moisture: 3180,
            ldr_light: 1820,
            timestamp: new Date(Date.now() - 5000).toISOString()
          },
          {
            air_temperature: 27.9,
            air_humidity: 67.0,
            soil_moisture: 3150,
            ldr_light: 1800,
            timestamp: new Date(Date.now() - 10000).toISOString()
          }
        ];
        setData(mockData);
      }
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      console.log('Using mock data due to fetch error');
      // Fallback to mock data on error
      const mockData = [
        {
          air_temperature: 28.5,
          air_humidity: 65.2,
          soil_moisture: 3200,
          ldr_light: 1850,
          timestamp: new Date().toISOString()
        },
        {
          air_temperature: 28.2,
          air_humidity: 66.1,
          soil_moisture: 3180,
          ldr_light: 1820,
          timestamp: new Date(Date.now() - 5000).toISOString()
        },
        {
          air_temperature: 27.9,
          air_humidity: 67.0,
          soil_moisture: 3150,
          ldr_light: 1800,
          timestamp: new Date(Date.now() - 10000).toISOString()
        }
      ];
      setData(mockData);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const NavItem = ({ id, label, icon: Icon }) => (
    <button 
      className={`sidebar-item ${activePage === id ? 'active' : ''}`}
      onClick={() => setActivePage(id)}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );

  const latest = data.length > 0 ? data[0] : {
    soil_moisture: null,
    air_temperature: null,
    air_humidity: null,
    ldr_light: null
  };

  return (
    <div className="app-layout">
      {/* ─── Sidebar ─── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Leaf size={24} fill="currentColor" />
          <span className="logo-text">PlantSense</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Dashboard</div>
          <NavItem id="overview" label="Overview" icon={LayoutDashboard} />
          <NavItem id="soil" label="Soil Moisture" icon={Droplets} />
          <NavItem id="temp" label="Temperature" icon={Thermometer} />
          <NavItem id="hum" label="Humidity" icon={Wind} />
          <NavItem id="light" label="Light Intensity" icon={Sun} />

          <div className="nav-label">Other</div>
          <NavItem id="notifications" label="Notifications" icon={Bell} />
          <NavItem id="history" label="History Logs" icon={HistoryIcon} />
          <NavItem id="settings" label="Settings" icon={SettingsIcon} />
        </nav>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', background: 'var(--brand-green)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <User size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: '700' }}>User</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>user@plantsense.com</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="main-content">
        {activePage === 'overview' && <Dashboard data={data} latest={latest} loading={loading} />}
        
        {activePage === 'soil' && (
          <SensorDetail 
            type="Soil Moisture" 
            value={latest.soil_moisture} 
            unit="%" 
            data={data}
            metricKey="soil_moisture"
            color="var(--brand-green)"
            min={0} max={4095}
          />
        )}
        
        {activePage === 'temp' && (
          <SensorDetail 
            type="Temperature" 
            value={latest.air_temperature} 
            unit="°C" 
            data={data}
            metricKey="air_temperature"
            color="var(--brand-amber)"
            min={0} max={50}
          />
        )}

        {activePage === 'hum' && (
          <SensorDetail 
            type="Humidity" 
            value={latest.air_humidity} 
            unit="%" 
            data={data}
            metricKey="air_humidity"
            color="var(--brand-blue)"
            min={0} max={100}
          />
        )}

        {activePage === 'light' && (
          <SensorDetail 
            type="Light Intensity" 
            value={latest.ldr_light} 
            unit="lux" 
            data={data}
            metricKey="ldr_light"
            color="var(--brand-purple)"
            min={0} max={4095}
          />
        )}

        {activePage === 'history' && <History />}
        {activePage === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default App;
