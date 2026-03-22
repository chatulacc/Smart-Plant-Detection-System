import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Search, 
  Download, 
  Calendar,
  Filter,
  ArrowUpDown,
  History as HistIcon
} from 'lucide-react';
import { motion } from 'framer-motion';

const API_URL = "https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app/plant.json";

const History = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get(API_URL);
        const firebaseData = response.data;
        console.log('History Firebase data:', firebaseData);
        
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
          
          // Sort by timestamp (most recent first)
          sensorArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          
          setLogs(sensorArray);
        } else {
          console.log('No Firebase data, using mock data');
          // Mock data as fallback
          const mockData = Array.from({length: 10}, (_, i) => ({
            air_temperature: 28 + Math.random() * 2,
            air_humidity: 60 + Math.random() * 10,
            soil_moisture: 3000 + Math.random() * 500,
            ldr_light: 1800 + Math.random() * 200,
            timestamp: new Date(Date.now() - i * 60000).toISOString()
          }));
          setLogs(mockData);
        }
      } catch (err) {
        console.error('Error fetching history:', err);
        setError('Failed to load historical data. Showing sample data.');
        // Mock data as fallback on error
        const mockData = Array.from({length: 10}, (_, i) => ({
          air_temperature: 28 + Math.random() * 2,
          air_humidity: 60 + Math.random() * 10,
          soil_moisture: 3000 + Math.random() * 500,
          ldr_light: 1800 + Math.random() * 200,
          timestamp: new Date(Date.now() - i * 60000).toISOString()
        }));
        setLogs(mockData);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedLogs = React.useMemo(() => {
    let sortableLogs = [...logs];
    if (sortConfig !== null) {
      sortableLogs.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableLogs;
  }, [logs, sortConfig]);

  const filteredLogs = sortedLogs.filter(log => {
    if (!searchTerm) return true;
    return Object.values(log).some(value => 
      value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Soil Moisture (%)', 'Temperature (°C)', 'Humidity (%)', 'Light (lux)', 'Status'];
    const csvContent = [
      headers.join(','),
      ...filteredLogs.map(log => [
        formatDate(log.timestamp),
        log.soil_moisture || '',
        log.air_temperature || '',
        log.air_humidity || '',
        log.ldr_light || '',
        'OPTIMAL'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sensor-data-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return 'N/A';
    const d = new Date(isoStr);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <header className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <h1>Historical Logs</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chronological record of sensor data</p>
        </div>
        <button className="sidebar-item" style={{ width: 'auto', gap: '8px', color: 'var(--brand-green)', background: 'var(--brand-green-soft)' }} onClick={exportToCSV}>
          <Download size={16} />
          Export CSV
        </button>
      </header>

      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
        <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0' }}>
            <div style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative', width: '320px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                        type="text" 
                        placeholder="Search logs..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '99px', padding: '10px 10px 10px 40px', fontSize: '0.85rem' }} 
                    />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="sidebar-item" style={{ width: 'auto', border: '1px solid var(--border)' }}><Filter size={16} /> Filter</button>
                    <button className="sidebar-item" style={{ width: 'auto', border: '1px solid var(--border)' }}><Calendar size={16} /> Date Range</button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-sidebar)', zIndex: 10 }}>
                        <tr>
                            <th style={thStyle} onClick={() => handleSort('timestamp')} style={{...thStyle, cursor: 'pointer'}}>
                                Timestamp <ArrowUpDown size={12} />
                            </th>
                            <th style={thStyle} onClick={() => handleSort('soil_moisture')} style={{...thStyle, cursor: 'pointer'}}>
                                Soil Moisture <ArrowUpDown size={12} />
                            </th>
                            <th style={thStyle} onClick={() => handleSort('air_temperature')} style={{...thStyle, cursor: 'pointer'}}>
                                Temp <ArrowUpDown size={12} />
                            </th>
                            <th style={thStyle} onClick={() => handleSort('air_humidity')} style={{...thStyle, cursor: 'pointer'}}>
                                Humidity <ArrowUpDown size={12} />
                            </th>
                            <th style={thStyle} onClick={() => handleSort('ldr_light')} style={{...thStyle, cursor: 'pointer'}}>
                                Light <ArrowUpDown size={12} />
                            </th>
                            <th style={thStyle}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    <div>Loading historical data...</div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--error)' }}>
                                    <div>{error}</div>
                                </td>
                            </tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>
                                    <HistIcon size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
                                    <p>{searchTerm ? 'No records match your search.' : 'No historical records found for this period.'}</p>
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map((log, i) => (
                                <tr key={i} style={trStyle}>
                                    <td style={tdStyle}>{formatDate(log.timestamp)}</td>
                                    <td style={tdStyle}>{log.soil_moisture ?? '--'}</td>
                                    <td style={tdStyle}>{log.air_temperature ? `${log.air_temperature}°C` : '--'}</td>
                                    <td style={tdStyle}>{log.air_humidity ? `${log.air_humidity}%` : '--'}</td>
                                    <td style={tdStyle}>{log.ldr_light ? `${log.ldr_light} lux` : '--'}</td>
                                    <td style={tdStyle}>
                                        <span style={{ 
                                            padding: '4px 10px', 
                                            borderRadius: '99px', 
                                            background: 'var(--brand-green-soft)', 
                                            color: 'var(--brand-green)',
                                            fontSize: '0.65rem',
                                            fontWeight: '800'
                                        }}>OPTIMAL</span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </>
  );
};

const thStyle = {
  padding: '16px 24px',
  fontSize: '0.7rem',
  fontWeight: '700',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border)'
};

const trStyle = {
  borderBottom: '1px solid var(--border)',
};

const tdStyle = {
  padding: '16px 24px',
  fontSize: '0.85rem',
  color: 'var(--text-primary)',
  fontWeight: '500'
};

export default History;
