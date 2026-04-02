import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  Thermometer, Droplets, Sun, Wind, Fan, Leaf, Activity, Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { database } from '../firebase';
import { ref, onValue, set } from 'firebase/database';

/* ─── Helpers ─── */
function computeHealthScore(latest) {
  if (!latest) return 0;
  let score = 0, total = 0;

  if (latest.soil_moisture !== null) {
    const s = latest.soil_moisture;
    score += s >= 30 && s <= 70 ? 100 : s >= 20 && s <= 80 ? 60 : 20;
    total++;
  }
  if (latest.air_temperature !== null) {
    const t = latest.air_temperature;
    score += t >= 18 && t <= 32 ? 100 : t >= 12 && t <= 38 ? 60 : 20;
    total++;
  }
  if (latest.air_humidity !== null) {
    const h = latest.air_humidity;
    score += h >= 40 && h <= 70 ? 100 : h >= 25 && h <= 85 ? 60 : 20;
    total++;
  }
  if (latest.ldr_light !== null) {
    const l = latest.ldr_light;
    score += l >= 30 && l <= 80 ? 100 : l >= 15 && l <= 90 ? 60 : 20;
    total++;
  }
  return total > 0 ? Math.round(score / total) : 0;
}

function healthLabel(score) {
  if (score >= 85) return { text: 'Excellent', color: 'var(--brand-green)' };
  if (score >= 65) return { text: 'Good', color: 'var(--brand-teal)' };
  if (score >= 45) return { text: 'Moderate', color: 'var(--brand-amber)' };
  return { text: 'At Risk', color: 'var(--brand-red)' };
}

function getProgress(value, min, max) {
  if (value === null || value === undefined) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/* ─── Sensor Card ─── */
const SensorCard = ({ title, value, unit, icon: Icon, color, subText, progress, min, max }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="card"
    style={{ cursor: 'default' }}
  >
    <span className="card-label">{title}</span>
    <div className="flex-between">
      <div>
        <div className="card-value">
          {value !== null && value !== undefined ? Number(value).toFixed(1) : '--'}
          <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}> {unit}</span>
        </div>
        <div style={{ fontSize: '0.75rem', color, marginTop: '4px', fontWeight: '700', letterSpacing: '0.02em' }}>
          {subText}
        </div>
      </div>
      <div
        className="insight-icon-wrap"
        style={{ background: `${color}20`, color, width: 44, height: 44, borderRadius: '12px' }}
      >
        <Icon size={22} />
      </div>
    </div>

    {/* Progress bar */}
    <div className="sensor-progress-wrap">
      <div className="sensor-progress-track">
        <div
          className="sensor-progress-fill"
          style={{ width: `${progress}%`, background: color }}
        />
      </div>
      <div className="sensor-progress-labels">
        <span>{min}{unit}</span>
        <span style={{ color, fontWeight: 700 }}>{progress.toFixed(0)}%</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  </motion.div>
);

/* ─── Device Control Card ─── */
const DeviceCard = ({ name, desc, icon: Icon, device, isOn, onToggle, activeColor, activeColorSoft }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.97 }}
    animate={{ opacity: 1, scale: 1 }}
    className="card device-card"
  >
    <div className="device-info">
      <div
        className="device-icon-wrap"
        style={{
          background: isOn ? activeColorSoft : 'var(--bg-muted)',
          color: isOn ? activeColor : 'var(--text-muted)',
          transition: 'all 0.3s'
        }}
      >
        <Icon size={22} className={isOn ? (device === 'fan' ? 'anim-spin' : 'anim-float') : ''} />
      </div>
      <div>
        <div className="device-name">{name}</div>
        <div className="device-status">
          Status:{' '}
          <strong style={{ color: isOn ? activeColor : 'var(--text-muted)' }}>
            {isOn ? 'ON — Active' : 'OFF — Standby'}
          </strong>
        </div>
      </div>
    </div>

    <label className="toggle-switch" title={`Toggle ${name}`}>
      <input
        type="checkbox"
        checked={isOn}
        onChange={() => onToggle(device)}
      />
      <span className="toggle-slider" />
    </label>
  </motion.div>
);

/* ─── Main Dashboard ─── */
const Dashboard = ({ data, latest, loading }) => {
  const [controls, setControls] = useState({ fan: 0, pump: 0 });
  const [activity, setActivity] = useState([]);

  /* Firebase control listeners */
  useEffect(() => {
    const fanRef  = ref(database, 'plant/fan');
    const pumpRef = ref(database, 'plant/pump');
    const unsubFan  = onValue(fanRef,  snap => { const v = snap.val(); if (v !== null) setControls(p => ({ ...p, fan: v })); });
    const unsubPump = onValue(pumpRef, snap => { const v = snap.val(); if (v !== null) setControls(p => ({ ...p, pump: v })); });
    return () => { unsubFan(); unsubPump(); };
  }, []);

  /* Build activity feed from last 5 data points */
  useEffect(() => {
    if (!data || !data.length) return;
    const last5 = data.slice(0, 5);
    const feed = last5.map((d, i) => {
      const msgs = [
        d.air_temperature !== null && `🌡️ Temp ${d.air_temperature?.toFixed(1)}°C`,
        d.air_humidity    !== null && `💧 Humidity ${d.air_humidity?.toFixed(1)}%`,
        d.soil_moisture   !== null && `🌱 Soil ${d.soil_moisture?.toFixed(1)}%`,
        d.ldr_light       !== null && `☀️ Light ${d.ldr_light?.toFixed(1)}%`,
      ].filter(Boolean);
      return {
        id: i,
        text: msgs[i % msgs.length] || 'Sensor reading received',
        time: d.timestamp,
        color: ['var(--brand-green)', 'var(--brand-amber)', 'var(--brand-blue)', 'var(--brand-purple)', 'var(--brand-teal)'][i % 5]
      };
    });
    setActivity(feed);
  }, [data]);

  const toggleDevice = async (device) => {
    const current = controls[device];
    const next = current === 1 ? 0 : 1;
    setControls(p => ({ ...p, [device]: next }));
    const deviceRef = ref(database, `plant/${device}`);
    try {
      await set(deviceRef, next);
    } catch {
      try {
        const url = `https://smart-plant-detection-system-default-rtdb.asia-southeast1.firebasedatabase.app/plant/${device}.json`;
        const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
        if (!res.ok) throw new Error();
      } catch {
        setControls(p => ({ ...p, [device]: current }));
      }
    }
  };

  const healthScore = computeHealthScore(latest);
  const { text: healthText, color: healthColor } = healthLabel(healthScore);

  /* Averages for bar chart */
  const getAverages = useCallback(() => {
    if (!data || !data.length) return [];
    const avg = (key) => {
      const valid = data.filter(d => d[key] != null);
      if (!valid.length) return 0;
      return valid.reduce((a, c) => a + Number(c[key]), 0) / valid.length;
    };
    return [
      { name: 'Moisture',    value: avg('soil_moisture'),   unit: '%',  fill: 'var(--brand-green)' },
      { name: 'Temperature', value: avg('air_temperature'), unit: '°C', fill: 'var(--brand-amber)' },
      { name: 'Humidity',    value: avg('air_humidity'),    unit: '%',  fill: 'var(--brand-blue)' },
      { name: 'Light',       value: avg('ldr_light'),       unit: '%',  fill: 'var(--brand-yellow)' },
    ];
  }, [data]);

  const avgData = getAverages();

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="page-content">
        <div className="stats-grid">
          {[1,2,3,4].map(i => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 36, width: '80%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 8, width: '100%' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* Soil */
  const sm = latest.soil_moisture;
  const soilColor = sm == null ? 'var(--brand-green)' : sm < 30 ? 'var(--brand-red)' : sm < 70 ? 'var(--brand-green)' : 'var(--brand-blue)';
  const soilSub   = sm == null ? '--' : sm < 30 ? '⚠ Dry — Water needed' : sm < 70 ? '✓ Healthy' : '⚠ Too Wet';

  /* Temp */
  const tmp = latest.air_temperature;
  const tempColor = tmp == null ? 'var(--brand-amber)' : tmp < 18 ? 'var(--brand-blue)' : tmp < 32 ? 'var(--brand-green)' : 'var(--brand-red)';
  const tempSub   = tmp == null ? '--' : tmp < 18 ? '❄ Cold' : tmp < 32 ? '✓ Optimal' : '🔥 Hot';

  /* Humidity */
  const hum = latest.air_humidity;
  const humColor = hum == null ? 'var(--brand-blue)' : hum < 30 ? 'var(--brand-red)' : hum < 40 ? 'var(--brand-amber)' : hum < 60 ? 'var(--brand-green)' : hum < 80 ? 'var(--brand-blue)' : 'var(--brand-red)';
  const humSub   = hum == null ? '--' : hum < 30 ? '⚠ Too Dry' : hum < 40 ? 'Low' : hum < 60 ? '✓ Optimal' : hum < 80 ? 'High' : '⚠ Too Humid';

  /* Light */
  const ldr = latest.ldr_light;
  const ldrColor = ldr == null ? 'var(--brand-yellow)' : ldr < 20 ? 'var(--text-muted)' : ldr < 40 ? 'var(--brand-blue)' : ldr < 75 ? 'var(--brand-green)' : ldr < 90 ? 'var(--brand-amber)' : 'var(--brand-red)';
  const ldrSub   = ldr == null ? '--' : ldr < 20 ? '⚠ Too Dark' : ldr < 40 ? 'Low Light' : ldr < 75 ? '✓ Healthy' : ldr < 90 ? 'Bright' : '⚠ Too Bright';

  return (
    <>
      <div className="page-content">

        {/* ─── Sensor Stats ─── */}
        <div className="stats-grid">
          <SensorCard
            title="Soil Moisture" value={sm} unit="%" icon={Droplets}
            color={soilColor} subText={soilSub}
            progress={getProgress(sm, 0, 100)} min={0} max={100}
          />
          <SensorCard
            title="Air Temperature" value={tmp} unit="°C" icon={Thermometer}
            color={tempColor} subText={tempSub}
            progress={getProgress(tmp, 0, 50)} min={0} max={50}
          />
          <SensorCard
            title="Air Humidity" value={hum} unit="%" icon={Wind}
            color={humColor} subText={humSub}
            progress={getProgress(hum, 0, 100)} min={0} max={100}
          />
          <SensorCard
            title="Light Intensity" value={ldr} unit="%" icon={Sun}
            color={ldrColor} subText={ldrSub}
            progress={getProgress(ldr, 0, 100)} min={0} max={100}
          />
        </div>

        {/* ─── Health Score + Activity Feed ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '20px' }}>
          {/* Health Score */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="card"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '28px 20px' }}
          >
            <Leaf size={28} color="var(--brand-green)" style={{ marginBottom: 12 }} />
            <span className="card-label" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>Greenhouse Health</span>
            {/* Score ring */}
            <svg width="120" height="120" viewBox="0 0 120 120" style={{ margin: '8px 0' }}>
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--bg-muted)" strokeWidth="10"/>
              <circle
                cx="60" cy="60" r="50"
                fill="none"
                stroke={healthColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(healthScore / 100) * 314} 314`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dasharray 1.2s ease' }}
              />
              <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text-primary)">{healthScore}</text>
              <text x="60" y="72" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-muted)">/ 100</text>
            </svg>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: healthColor }}>{healthText}</div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>Overall plant wellbeing</div>
          </motion.div>

          {/* Activity Feed */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="card"
          >
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={18} color="var(--brand-green)" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: '800' }}>Live Activity Feed</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                <span className="connection-dot online" />
                Updating every 5s
              </div>
            </div>
            <div className="activity-feed">
              {activity.length === 0
                ? <div className="empty-state" style={{ padding: '20px' }}><Clock size={24} /><p>Waiting for data...</p></div>
                : activity.map(item => (
                  <div key={item.id} className="activity-item">
                    <div className="activity-dot" style={{ background: item.color }} />
                    <div style={{ flex: 1 }}>
                      <div className="activity-text">{item.text}</div>
                      <div className="activity-time">{formatTime(item.time)}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          </motion.div>
        </div>

        {/* ─── Device Controls ─── */}
        <div className="device-grid" style={{ marginBottom: '20px' }}>
          <DeviceCard
            name="Cooling Fan" desc="Controls greenhouse ventilation"
            icon={Fan} device="fan"
            isOn={controls.fan === 1} onToggle={toggleDevice}
            activeColor="var(--brand-blue)" activeColorSoft="var(--brand-blue-soft)"
          />
          <DeviceCard
            name="Water Pump" desc="Automated irrigation system"
            icon={Droplets} device="pump"
            isOn={controls.pump === 1} onToggle={toggleDevice}
            activeColor="var(--brand-green)" activeColorSoft="var(--brand-green-soft)"
          />
        </div>

        {/* ─── Average Bar Chart ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="card chart-card"
        >
          <div className="flex-between" style={{ marginBottom: 28 }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800' }}>Sensor Averages</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Average values across all readings
              </p>
            </div>
          </div>

          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={avgData} margin={{ top: 40, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  axisLine={false} tickLine={false}
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontWeight: 600 }}
                  dy={8}
                />
                <YAxis hide domain={[0, 105]} />
                <Tooltip
                  cursor={{ fill: 'var(--bg-muted)', opacity: 0.6, radius: 6 }}
                  content={({ active, payload }) => {
                    if (active && payload?.length) {
                      const d = payload[0].payload;
                      return (
                        <div style={{
                          background: 'var(--bg-card)', padding: '12px 16px',
                          borderRadius: 10, boxShadow: 'var(--shadow-md)',
                          border: '1px solid var(--border)'
                        }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
                          <div style={{ color: d.fill, fontWeight: 800, fontSize: '1.2rem' }}>
                            {d.value?.toFixed(1)} {d.unit}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="value" radius={[8,8,0,0]} barSize={72}
                  label={({ x, y, width, index }) => {
                    const e = avgData[index];
                    return (
                      <text x={x + width / 2} y={y - 10} fill="var(--text-muted)" textAnchor="middle" fontSize={12} fontWeight={700}>
                        {e?.value?.toFixed(1)}{e?.unit}
                      </text>
                    );
                  }}
                >
                  {avgData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} opacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

      </div>
    </>
  );
};

export default Dashboard;
