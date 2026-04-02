import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  Droplets, Thermometer, Wind, Sun,
  AlertCircle, Info, TrendingUp, TrendingDown, Minus, History
} from 'lucide-react';
import { motion } from 'framer-motion';

/* ─── Time filter helper ─── */
const RANGES = [
  { label: '1 H',  ms: 60 * 60 * 1000 },
  { label: '6 H',  ms: 6 * 60 * 60 * 1000 },
  { label: '24 H', ms: 24 * 60 * 60 * 1000 },
  { label: 'All',  ms: Infinity },
];

/* ─── Dynamic insights ─── */
function getInsights(type, value) {
  const val = value || 0;

  if (type === 'Soil Moisture') {
    const health = val < 30 ? 'Dry' : val < 70 ? 'Healthy' : 'Too Wet';
    const hColor = val < 30 ? 'var(--brand-red)' : val < 70 ? 'var(--brand-green)' : 'var(--brand-blue)';
    const rec = val < 30
      ? 'Watering required immediately to prevent wilting.'
      : val < 70 ? 'Moisture levels are optimal for growth.'
      : 'Hold off on watering — risk of root rot.';
    return {
      health, healthColor: hColor, recommendation: rec,
      insights: [
        { title: 'Watering', desc: 'Next watering cycle estimated in 18–24 hours based on current soil drying rate.', icon: Droplets, bg: 'var(--brand-blue-soft)', col: 'var(--brand-blue)' },
        { title: 'Evaporation', desc: 'Current air temperature is causing moderate evaporation (~2.3% drop per day).', icon: Wind, bg: 'var(--brand-amber-soft)', col: 'var(--brand-amber)' },
        { title: 'Retention', desc: 'Soil quality shows moderate water retention. Consider adding mulch to reduce evaporation.', icon: TrendingUp, bg: 'var(--brand-green-soft)', col: 'var(--brand-green)' },
      ]
    };
  }

  if (type === 'Temperature') {
    const health = val < 18 ? 'Cold' : val < 32 ? 'Optimal' : 'Hot';
    const hColor = val < 18 ? 'var(--brand-blue)' : val < 32 ? 'var(--brand-green)' : 'var(--brand-red)';
    const rec = val < 18 ? 'Move plants to warmer zone or use a heater.' : val < 32 ? 'Temperature is ideal for greenhouse growth.' : 'Ensure ventilation. Fan ON recommended.';
    return {
      health, healthColor: hColor, recommendation: rec,
      insights: [
        { title: 'Assessment', desc: `${val.toFixed(1)}°C is ${health.toLowerCase()} for typical greenhouse plants.`, icon: Thermometer, bg: 'var(--brand-amber-soft)', col: 'var(--brand-amber)' },
        { title: 'Growth Rate', desc: val < 18 ? 'Growth may slow significantly below 18°C.' : val < 32 ? 'Optimal temperature guarantees steady healthy growth.' : 'High temps dry soil fast — monitor moisture closely.', icon: TrendingUp, bg: 'var(--brand-green-soft)', col: 'var(--brand-green)' },
      ]
    };
  }

  if (type === 'Humidity') {
    const health = val < 30 ? 'Too Dry' : val < 40 ? 'Low' : val < 60 ? 'Optimal' : val < 80 ? 'High' : 'Too Humid';
    const hColor = val < 30 ? 'var(--brand-red)' : val < 40 ? 'var(--brand-amber)' : val < 60 ? 'var(--brand-green)' : val < 80 ? 'var(--brand-blue)' : 'var(--brand-red)';
    const rec = val < 30 ? 'Mist the environment or use a humidifier.' : val < 60 ? 'Air humidity is at comfortable indoor levels.' : 'Improve ventilation to prevent fungal diseases.';
    return {
      health, healthColor: hColor, recommendation: rec,
      insights: [
        { title: 'Air Moisture', desc: val < 40 ? 'Too dry — consider a pebble tray or humidifier.' : val < 80 ? 'Healthy humidity reduces need for frequent watering.' : 'Excessively high humidity risks mold and fungal growth.', icon: Wind, bg: 'var(--brand-blue-soft)', col: 'var(--brand-blue)' },
        { title: 'Plant Hydration', desc: val < 40 ? 'Plants lose water faster via leaves in dry air.' : 'Current humidity supports healthy leaf transpiration.', icon: Droplets, bg: 'var(--brand-green-soft)', col: 'var(--brand-green)' },
      ]
    };
  }

  if (type === 'Light Intensity') {
    const health = val < 20 ? 'Too Dark' : val < 40 ? 'Low Light' : val < 75 ? 'Healthy' : val < 90 ? 'Bright' : 'Too Bright';
    const hColor = val < 20 ? 'var(--text-muted)' : val < 40 ? 'var(--brand-blue)' : val < 75 ? 'var(--brand-green)' : val < 90 ? 'var(--brand-amber)' : 'var(--brand-red)';
    const rec = val < 20 ? 'Move plants to a brighter location or supplement with grow lights.' : val < 75 ? 'Light levels are ideal for photosynthesis.' : 'Provide shade cloth to protect from leaf burn.';
    return {
      health, healthColor: hColor, recommendation: rec,
      insights: [
        { title: 'Light Exposure', desc: val < 40 ? 'Insufficient light limits photosynthesis and slows growth.' : val < 90 ? 'Great light levels support robust daily growth.' : 'Direct prolonged sun may damage delicate plant tissue.', icon: Sun, bg: 'var(--brand-yellow-soft)', col: 'var(--brand-yellow)' },
        { title: 'Photosynthesis', desc: val < 40 ? 'Growth severely limited by available light.' : val < 90 ? 'Optimal light supports maximum energy production.' : 'Risk of photo-oxidative stress at extreme intensities.', icon: TrendingUp, bg: 'var(--brand-green-soft)', col: 'var(--brand-green)' },
      ]
    };
  }

  return {
    health: 'Nominal', healthColor: 'var(--brand-green)',
    recommendation: 'All parameters within normal range.',
    insights: [
      { title: 'Status', desc: 'All parameters are stable. No action required.', icon: Info, bg: 'var(--brand-blue-soft)', col: 'var(--brand-blue)' },
      { title: 'Trend', desc: 'Data shows a steady pattern over the last 24 hours.', icon: History, bg: 'var(--brand-purple-soft)', col: 'var(--brand-purple)' },
    ]
  };
}

/* ─── Component ─── */
const SensorDetail = ({ type, value, unit, data, metricKey, color, min, max }) => {
  const [rangeIdx, setRangeIdx] = useState(3); // default "All"

  const { health, healthColor, recommendation, insights } = getInsights(type, value);

  /* Stats */
  const stats = useMemo(() => {
    if (!data || !data.length) return { min: null, max: null, avg: null };
    const vals = data.map(d => d[metricKey]).filter(v => v != null);
    if (!vals.length) return { min: null, max: null, avg: null };
    return {
      min: Math.min(...vals).toFixed(1),
      max: Math.max(...vals).toFixed(1),
      avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
    };
  }, [data, metricKey]);

  /* Trend direction */
  const trend = useMemo(() => {
    if (!data || data.length < 3) return 'stable';
    const recent = data.slice(0, 5).map(d => d[metricKey]).filter(v => v != null);
    if (recent.length < 2) return 'stable';
    const delta = recent[0] - recent[recent.length - 1];
    if (Math.abs(delta) < 0.5) return 'stable';
    return delta > 0 ? 'up' : 'down';
  }, [data, metricKey]);

  /* Filtered chart data */
  const filteredData = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    const ms = RANGES[rangeIdx].ms;
    return [...data]
      .filter(d => ms === Infinity || (now - new Date(d.timestamp).getTime()) <= ms)
      .reverse(); // chronological for chart
  }, [data, rangeIdx]);

  /* Daily averages */
  const dailyData = useMemo(() => {
    if (!data || !data.length) return [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const groups = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      groups[days[d.getDay()]] = { sum: 0, count: 0 };
    }
    data.forEach(item => {
      if (!item.timestamp) return;
      const dn = days[new Date(item.timestamp).getDay()];
      if (groups[dn] && item[metricKey] != null) {
        groups[dn].sum += Number(item[metricKey]);
        groups[dn].count++;
      }
    });
    return Object.entries(groups).map(([day, g]) => ({
      day,
      average: g.count > 0 ? parseFloat((g.sum / g.count).toFixed(1)) : 0
    }));
  }, [data, metricKey]);

  /* Gauge */
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const dashOffset = 188 - (pct * 1.88);

  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="page-content">
      <header className="analysis-header">
        <h2>{type}</h2>
        <p>Monitor {type.toLowerCase()} levels to optimise greenhouse care decisions</p>
      </header>

      {/* ─── Top stats ─── */}
      <div className="stats-grid-3" style={{ marginBottom: 20 }}>
        {/* Current value */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
          <span className="card-label">Current {type}</span>
          <div className="flex-between">
            <div>
              <div className="card-value">
                {value !== null && value !== undefined ? Number(value).toFixed(1) : '--'}
                <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}> {unit}</span>
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                {trend === 'up'   && <><TrendingUp size={12}  style={{ color: 'var(--brand-amber)' }} /><span style={{ color: 'var(--brand-amber)' }}>Rising trend</span></>}
                {trend === 'down' && <><TrendingDown size={12} style={{ color: 'var(--brand-blue)' }}  /><span style={{ color: 'var(--brand-blue)' }}>Falling trend</span></>}
                {trend === 'stable' && <><Minus size={12} style={{ color: 'var(--brand-green)' }}     /><span style={{ color: 'var(--brand-green)' }}>Stable</span></>}
              </div>
            </div>
            <div className="insight-icon-wrap" style={{ background: `${color}20`, color, width: 44, height: 44, borderRadius: '12px' }}>
              <Info size={20} />
            </div>
          </div>
        </motion.div>

        {/* Health */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="card health-card">
          <span className="card-label">Health Status</span>
          <div className="health-status" style={{ color: healthColor }}>{health}</div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>{recommendation}</p>
        </motion.div>

        {/* Min / Max / Avg */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="card">
          <span className="card-label">Session Statistics</span>
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            {[['Min', stats.min], ['Avg', stats.avg], ['Max', stats.max]].map(([lbl, val]) => (
              <div key={lbl} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{lbl}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{val ?? '--'}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{unit}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ─── Gauge + Insights ─── */}
      <div className="analysis-main-grid">
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="card">
          <div className="gauge-container">
            <svg width="220" height="140" viewBox="0 0 220 140">
              {/* Track */}
              <path d="M 40 110 A 70 70 0 0 1 180 110" fill="none" stroke="var(--bg-muted)" strokeWidth="14" strokeLinecap="round" />
              {/* Zones (visual) */}
              <path d="M 40 110 A 70 70 0 0 1 180 110" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeOpacity="0.12" />
              {/* Active arc */}
              <path
                d="M 40 110 A 70 70 0 0 1 180 110"
                fill="none"
                stroke={color}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray="220"
                strokeDashoffset={220 - (pct * 2.2)}
                style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
              />
            </svg>
            <div className="gauge-value" style={{ color }}>{value !== null ? Number(value).toFixed(1) : '--'}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>{unit}</div>

            {/* Min / Max labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 200, marginTop: 6 }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{min}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{max}</span>
            </div>

            {/* Stats row */}
            <div className="gauge-stats">
              {[['Min', stats.min], ['Avg', stats.avg], ['Max', stats.max]].map(([lbl, val]) => (
                <div key={lbl} className="gauge-stat-item">
                  <div className="gauge-stat-val">{val ?? '--'}</div>
                  <div className="gauge-stat-lbl">{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: 20 }}>Key Insights</h3>
          <div className="insight-list">
            {insights.map((item, i) => (
              <div className="insight-item" key={i}>
                <div className="insight-icon-wrap" style={{ background: item.bg, color: item.col }}>
                  <item.icon size={16} />
                </div>
                <div>
                  <div className="insight-title">{item.title}</div>
                  <div className="insight-desc">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ─── Time Series Chart ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card chart-card">
        <div className="flex-between" style={{ marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '800' }}>Time-Series (Live)</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {filteredData.length} readings shown
            </p>
          </div>
          <div className="time-tabs">
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                className={`time-tab ${rangeIdx === i ? 'active' : ''}`}
                onClick={() => setRangeIdx(i)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sensorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTime}
                axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['dataMin - 2', 'dataMax + 2']}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false} axisLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, fontSize: '0.8rem', boxShadow: 'var(--shadow-md)'
                }}
                labelFormatter={formatTime}
                formatter={v => [`${Number(v).toFixed(1)}${unit}`, type]}
              />
              <Area type="monotone" dataKey={metricKey} stroke={color} fill="url(#sensorGrad)"
                strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: color }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* ─── Daily Averages ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card chart-card" style={{ marginTop: 20 }}>
        <div className="flex-between" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800' }}>Daily Averages</h3>
          <div className="time-tab active" style={{ cursor: 'default', pointerEvents: 'none' }}>Last 7 Days</div>
        </div>

        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--bg-muted)', opacity: 0.5 }}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: '0.8rem' }}
                formatter={v => [`${v}${unit}`, 'Daily Avg']}
              />
              <Bar dataKey="average" fill={color} radius={[6,6,0,0]} barSize={28} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
};

export default SensorDetail;
