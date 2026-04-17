import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Search, Download, Calendar, Filter, ArrowUpDown, History as HistIcon,
  ArrowLeft, ArrowRight, CheckCircle, AlertCircle, AlertTriangle, Info
} from 'lucide-react';

const API_URL = "https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app/plant.json";
const PAGE_SIZE = 10;

/* ─── Status from sensor values ─── */
function getRowStatus(log) {
  const issues = [];
  const { soil_moisture: sm, air_temperature: tmp, air_humidity: hum, ldr_light: ldr } = log;

  if (sm  !== null && sm  < 30) issues.push({ type: 'critical', msg: 'Dry soil' });
  if (sm  !== null && sm  > 85) issues.push({ type: 'warning',  msg: 'Wet soil' });
  if (tmp !== null && tmp > 35) issues.push({ type: 'critical', msg: 'High temp' });
  if (tmp !== null && tmp < 15) issues.push({ type: 'warning',  msg: 'Low temp' });
  if (hum !== null && hum < 30) issues.push({ type: 'warning',  msg: 'Dry air' });
  if (hum !== null && hum > 80) issues.push({ type: 'info',     msg: 'Humid' });
  if (ldr !== null && ldr < 20) issues.push({ type: 'warning',  msg: 'Low light' });

  if (issues.find(i => i.type === 'critical')) return { label: 'Alert',    cls: 'sev-critical', icon: AlertCircle };
  if (issues.find(i => i.type === 'warning'))  return { label: 'Warning',  cls: 'sev-warning',  icon: AlertTriangle };
  if (issues.find(i => i.type === 'info'))     return { label: 'Info',     cls: 'sev-info',     icon: Info };
  return { label: 'Optimal', cls: 'sev-ok', icon: CheckCircle };
}

function cellClass(key, value) {
  if (value === null || value === undefined) return '';
  if (key === 'soil_moisture') {
    if (value < 30) return 'cell-danger';
    if (value < 50 || value > 80) return 'cell-warn';
    return 'cell-ok';
  }
  if (key === 'air_temperature') {
    if (value < 15 || value > 35) return 'cell-danger';
    if (value < 18 || value > 32) return 'cell-warn';
    return 'cell-ok';
  }
  if (key === 'air_humidity') {
    if (value < 25 || value > 85) return 'cell-danger';
    if (value < 35 || value > 75) return 'cell-warn';
    return 'cell-ok';
  }
  if (key === 'ldr_light') {
    if (value < 20) return 'cell-danger';
    if (value < 35 || value > 90) return 'cell-warn';
    return 'cell-ok';
  }
  return '';
}

const DATE_RANGES = ['All Time', 'Today', 'Last 7 Days', 'Last 30 Days'];

const History = () => {
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [searchTerm, setSearch]   = useState('');
  const [sortConfig, setSort]     = useState({ key: 'timestamp', dir: 'desc' });
  const [dateRange, setDateRange] = useState('All Time');
  const [page, setPage]           = useState(1);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const res = await axios.get(API_URL);
        const fbData = res.data;

        const normalize = (v) => ({
          air_temperature: v.temperature ?? v.air_temperature ?? v.temp ?? null,
          air_humidity:    v.humidity ?? v.air_humidity ?? null,
          soil_moisture:   v.soil ?? v.soil_moisture ?? v.moisture ?? null,
          ldr_light:       v.ldr ?? v.ldr_light ?? v.light ?? null,
          timestamp:       v.timestamp ?? v.time ?? new Date().toISOString()
        });

        if (fbData && typeof fbData === 'object' && Object.keys(fbData).length > 0) {
          const isFlat = 'temperature' in fbData || 'humidity' in fbData || 'soil' in fbData || 'ldr' in fbData;
          const arr = isFlat
            ? [normalize(fbData)]
            : Object.entries(fbData)
                .filter(([, v]) => v && typeof v === 'object')
                .map(([, v]) => normalize(v));
          arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          setLogs(arr);
        } else {
          setLogs(generateMock());
        }
      } catch {
        setLogs(generateMock());
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
    const iv = setInterval(fetchHistory, 5000);
    return () => clearInterval(iv);
  }, []);

  function generateMock() {
    return Array.from({ length: 30 }, (_, i) => ({
      air_temperature: 22 + Math.sin(i * 0.4) * 8,
      air_humidity:    55 + Math.cos(i * 0.3) * 15,
      soil_moisture:   50 + Math.sin(i * 0.6) * 25,
      ldr_light:       60 + Math.cos(i * 0.5) * 25,
      timestamp:       new Date(Date.now() - i * 120000).toISOString()
    }));
  }

  const handleSort = (key) => {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  };

  /* Filter by date range */
  const dateFiltered = useMemo(() => {
    const now = Date.now();
    return logs.filter(log => {
      const ms = new Date(log.timestamp).getTime();
      if (dateRange === 'Today')       return now - ms < 24 * 3600000;
      if (dateRange === 'Last 7 Days') return now - ms < 7 * 24 * 3600000;
      if (dateRange === 'Last 30 Days')return now - ms < 30 * 24 * 3600000;
      return true;
    });
  }, [logs, dateRange]);

  /* Search */
  const searched = useMemo(() =>
    searchTerm
      ? dateFiltered.filter(log =>
          Object.values(log).some(v => v && v.toString().toLowerCase().includes(searchTerm.toLowerCase()))
        )
      : dateFiltered,
  [dateFiltered, searchTerm]);

  /* Sort */
  const sorted = useMemo(() => {
    const arr = [...searched];
    arr.sort((a, b) => {
      const av = a[sortConfig.key], bv = b[sortConfig.key];
      if (av < bv) return sortConfig.dir === 'asc' ? -1 : 1;
      if (av > bv) return sortConfig.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [searched, sortConfig]);

  /* Paginate */
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* CSV export */
  const exportCSV = () => {
    const headers = ['Timestamp', 'Soil Moisture (%)', 'Temperature (°C)', 'Humidity (%)', 'Light (%)', 'Status'];
    const rows = sorted.map(l => [
      formatDate(l.timestamp),
      l.soil_moisture ?? '',
      l.air_temperature ?? '',
      l.air_humidity ?? '',
      l.ldr_light ?? '',
      getRowStatus(l).label
    ].join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `greenhouse-log-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const formatDate = (iso) => {
    if (!iso) return 'N/A';
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const SortIcon = ({ field }) => (
    <ArrowUpDown
      size={11}
      style={{ marginLeft: 4, color: sortConfig.key === field ? 'var(--brand-green)' : 'var(--text-muted)', flexShrink: 0 }}
    />
  );

  return (
    <>
      <header className="top-bar">
        <div>
          <h1>Historical Logs</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {sorted.length} total records · Page {page} of {totalPages}
          </p>
        </div>
        <button
          className="sidebar-item"
          style={{ width: 'auto', gap: 8, color: 'var(--brand-green)', background: 'var(--brand-green-soft)', border: '1px solid var(--brand-green)' }}
          onClick={exportCSV}
        >
          <Download size={15} />Export CSV
        </button>
      </header>

      <div className="page-content">
        {/* Filters bar */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          marginBottom: 20, padding: '16px 20px',
          background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
        }}>
          {/* Search */}
          <div className="search-input-wrap" style={{ flex: 1, minWidth: 200 }}>
            <Search size={15} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {/* Date range tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-muted)', borderRadius: 8, padding: 4 }}>
            {DATE_RANGES.map(r => (
              <button
                key={r}
                className={`time-tab ${dateRange === r ? 'active' : ''}`}
                onClick={() => { setDateRange(r); setPage(1); }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="history-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('timestamp')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>Timestamp <SortIcon field="timestamp" /></span>
                  </th>
                  <th onClick={() => handleSort('soil_moisture')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>Soil Moisture <SortIcon field="soil_moisture" /></span>
                  </th>
                  <th onClick={() => handleSort('air_temperature')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>Temperature <SortIcon field="air_temperature" /></span>
                  </th>
                  <th onClick={() => handleSort('air_humidity')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>Humidity <SortIcon field="air_humidity" /></span>
                  </th>
                  <th onClick={() => handleSort('ldr_light')} style={{ cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>Light <SortIcon field="ldr_light" /></span>
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {[1,2,3,4,5,6].map(j => (
                        <td key={j}><div className="skeleton" style={{ height: 12, borderRadius: 6 }} /></td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan="6">
                      <div className="empty-state">
                        <HistIcon size={40} style={{ opacity: 0.2 }} />
                        <p>{searchTerm ? 'No records match your search.' : 'No records found for the selected period.'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((log, i) => {
                    const status = getRowStatus(log);
                    const StatusIcon = status.icon;
                    return (
                      <tr key={i}>
                        <td>{formatDate(log.timestamp)}</td>
                        <td className={cellClass('soil_moisture', log.soil_moisture)}>
                          {log.soil_moisture !== null ? `${Number(log.soil_moisture).toFixed(1)}%` : '--'}
                        </td>
                        <td className={cellClass('air_temperature', log.air_temperature)}>
                          {log.air_temperature !== null ? `${Number(log.air_temperature).toFixed(1)}°C` : '--'}
                        </td>
                        <td className={cellClass('air_humidity', log.air_humidity)}>
                          {log.air_humidity !== null ? `${Number(log.air_humidity).toFixed(1)}%` : '--'}
                        </td>
                        <td className={cellClass('ldr_light', log.ldr_light)}>
                          {log.ldr_light !== null ? `${Number(log.ldr_light).toFixed(1)}%` : '--'}
                        </td>
                        <td>
                          <span className={`status-badge ${status.cls}`}>
                            <StatusIcon size={10} />
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && sorted.length > PAGE_SIZE && (
            <div className="pagination">
              <span className="pagination-info">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} records
              </span>
              <div className="pagination-btns">
                <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                  <ArrowLeft size={13} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return (
                    <button key={p} className={`page-btn ${page === p ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                  );
                })}
                <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
                  <ArrowRight size={13} />
                </button>
                <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default History;
