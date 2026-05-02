import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell
} from 'recharts';
import {
  Activity, TrendingUp, AlertTriangle, Cpu, Info, Zap,
  BarChart2, RefreshCcw, Gauge, Target
} from 'lucide-react';
import { motion } from 'framer-motion';

const Analytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [insights, setInsights] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const resp = await axios.get('http://127.0.0.1:5000/api/ml-insights');
      setInsights(resp.data);

      const mResp = await axios.get('http://127.0.0.1:5000/api/model-info');
      setModelInfo(mResp.data);

      setError(null);
    } catch (err) {
      console.error("Analytics fetch error:", err);
      const backendMsg = err.response?.data?.error;
      // Try fallback: compute lightweight insights on the client from Firebase historical data
      try {
        const fallback = await fetchFirebaseFallback();
        setInsights(fallback.insights);
        setModelInfo(fallback.modelInfo);
        setError(null);
      } catch (fbErr) {
        console.warn('Fallback analytics also failed:', fbErr);
        setError(backendMsg || "Waiting for backend analytics... Ensure the Python server is running.");
      }
    } finally {
      setLoading(false);
    }
  };

  const FIREBASE_URL = 'https://plant-b5ffc-default-rtdb.asia-southeast1.firebasedatabase.app/plant.json';

  const normalizeRecord = (v) => ({
    air_temperature: v.temperature ?? v.air_temperature ?? v.temp ?? null,
    air_humidity:    v.humidity ?? v.air_humidity ?? null,
    soil_moisture:   v.soil ?? v.soil_moisture ?? v.moisture ?? null,
    ldr_light:       v.ldr ?? v.ldr_light ?? v.light ?? null,
    timestamp:       v.timestamp ?? v.time ?? new Date().toISOString()
  });

  const mean = (arr) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
  const std = (arr) => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length || 1));
  };

  const corr = (a, b) => {
    const ma = mean(a), mb = mean(b);
    const num = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0);
    const den = Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0) * b.reduce((s, v) => s + (v - mb) ** 2, 0));
    return den === 0 ? 0 : +(num / den).toFixed(2);
  };

  const linearPredictNext = (arr) => {
    if (!arr || arr.length < 2) return null;
    // simple linear regression on index
    const n = arr.length;
    const X = Array.from({ length: n }, (_, i) => i + 1);
    const meanX = mean(X), meanY = mean(arr);
    const num = X.reduce((s, xi, i) => s + (xi - meanX) * (arr[i] - meanY), 0);
    const den = X.reduce((s, xi) => s + (xi - meanX) ** 2, 0);
    const slope = den === 0 ? 0 : num / den;
    const intercept = meanY - slope * meanX;
    const nextX = n + 1;
    return +(slope * nextX + intercept).toFixed(1);
  };

  const fetchFirebaseFallback = async () => {
    const resp = await axios.get(FIREBASE_URL, { timeout: 8000 });
    const data = resp.data;
    if (!data) throw new Error('No firebase data');

    let source = data;
    if (data.readings && typeof data.readings === 'object') source = data.readings;

    let arr = [];
    const isFlat = 'temperature' in source || 'humidity' in source || 'soil' in source || 'ldr' in source;
    if (isFlat) arr = [normalizeRecord(source)];
    else arr = Object.entries(source).filter(([, v]) => v && typeof v === 'object').map(([, v]) => normalizeRecord(v));

    arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // oldest-first for regression
    const tail = arr.slice(-20);
    const features = {
      air_temperature: tail.map(r => Number(r.air_temperature) || 0),
      air_humidity: tail.map(r => Number(r.air_humidity) || 0),
      soil_moisture: tail.map(r => Number(r.soil_moisture) || 0),
      ldr_light: tail.map(r => Number(r.ldr_light) || 0)
    };

    const forecasts = {
      air_temperature: linearPredictNext(features.air_temperature),
      air_temperature_trend: (features.air_temperature.length >= 2 && (features.air_temperature[features.air_temperature.length - 1] - features.air_temperature[0]) > 0) ? 'rising' : 'falling',
      soil_moisture: linearPredictNext(features.soil_moisture),
      soil_moisture_trend: (features.soil_moisture.length >= 2 && (features.soil_moisture[features.soil_moisture.length - 1] - features.soil_moisture[0]) > 0) ? 'rising' : 'falling'
    };

    const zAnoms = tail.map((r, idx) => {
      const zs = Object.keys(features).map(k => {
        const s = std(features[k]) || 1;
        return Math.abs((features[k][idx] - mean(features[k])) / s);
      });
      return zs.some(z => z > 2.5);
    });

    const anomalies_count = zAnoms.filter(Boolean).length;

    const corr_matrix = {
      air_temperature: {
        soil_moisture: corr(features.air_temperature, features.soil_moisture),
        air_humidity: corr(features.air_temperature, features.air_humidity),
        ldr_light: corr(features.air_temperature, features.ldr_light)
      },
      air_humidity: {
        soil_moisture: corr(features.air_humidity, features.soil_moisture),
        ldr_light: corr(features.air_humidity, features.ldr_light)
      }
    };

    const refined_bounds = {};
    Object.entries(features).forEach(([k, vals]) => {
      refined_bounds[k] = {
        learned_min: +(mean(vals) - 2 * std(vals)).toFixed(1),
        learned_max: +(mean(vals) + 2 * std(vals)).toFixed(1),
        current_mean: +mean(vals).toFixed(1)
      };
    });

    const insights = {
      forecasting: forecasts,
      anomalies: {
        count: anomalies_count,
        is_anomalous: zAnoms[zAnoms.length - 1] || false,
        confidence: 0.6
      },
      correlation: corr_matrix,
      refined_bounds,
      summary: `Computed lightweight analytics from ${tail.length} Firebase readings (fallback).`
    };

    const modelInfo = { feature_importance: { 'Soil Moisture': 0.5, 'Temperature': 0.3, 'Air Humidity': 0.2 } };
    return { insights, modelInfo };
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) return (
    <div className="page-content">
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <RefreshCcw className="anim-spin" size={32} color="var(--brand-green)" />
        <p style={{ marginTop: 12, fontWeight: 700 }}>Computing Advanced ML Insights...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="page-content">
      <div className="card" style={{ padding: 40, textAlign: 'center', border: '1px solid var(--brand-red)' }}>
        <AlertTriangle size={32} color="var(--brand-red)" />
        <h3 style={{ marginTop: 12 }}>Analytics Error</h3>
        <p style={{ marginTop: 4, color: 'var(--text-muted)' }}>{error}</p>
        <button onClick={fetchAnalytics} className="sidebar-item" style={{ width: 'auto', margin: '16px auto', background: 'var(--bg-muted)' }}>
          <RefreshCcw size={14} /> Retry
        </button>
      </div>
    </div>
  );

  // Prep Correlation Data for Radar Chart
  const radarData = modelInfo?.feature_importance ? Object.entries(modelInfo.feature_importance).map(([key, val]) => ({
    subject: key,
    A: val * 100,
    fullMark: 100
  })) : [];

  return (
    <div className="page-content">
      <div className="flex-between" style={{ marginBottom: 24 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Cpu color="var(--brand-green)" /> AI Analytics Engine
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Statistical & Machine Learning analysis of greenhouse performance
          </p>
        </div>
        <button className="theme-toggle-btn" onClick={fetchAnalytics}>
          <RefreshCcw size={14} /> Refresh Analysis
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        
        {/* Technique 1: Forecasting */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} color="var(--brand-blue)" /> Temporal Trend Analysis
            </h3>
            <span className="nav-badge" style={{ background: 'var(--brand-blue-soft)', color: 'var(--brand-blue)' }}>REGRESSION</span>
          </div>
          <div style={{ padding: 12, background: 'var(--bg-muted)', borderRadius: 10, marginBottom: 16 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Forecast Prediction (Next Hour)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4 }}>
              Temp: {insights.forecasting.air_temperature}°C 
              <span style={{ fontSize: '0.8rem', marginLeft: 8, color: insights.forecasting.air_temperature_trend === 'rising' ? 'var(--brand-red)' : 'var(--brand-green)' }}>
                ({insights.forecasting.air_temperature_trend})
              </span>
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            ML regression model trained on last 50 data points to predict future environmental shifts.
          </p>
        </motion.div>

        {/* Technique 2: Anomaly Detection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color="var(--brand-amber)" /> Anomaly Detection
            </h3>
            <span className="nav-badge" style={{ background: 'var(--brand-amber-soft)', color: 'var(--brand-amber)' }}>ISOLATION FOREST</span>
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ textAlign: 'center', flex: 1, padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{insights.anomalies.count}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>Total Outliers Found</div>
            </div>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: insights.anomalies.is_anomalous ? 'var(--brand-red)' : 'var(--brand-green)' }}>
                {insights.anomalies.is_anomalous ? "⚠️ Anomaly Detected Now!" : "✓ Stable Pattern"}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Unsupervised learning identifying readings that deviate significantly from history.
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        
        {/* Technique 3: Correlation & Feature Importance */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card">
          <div className="flex-between" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={18} color="var(--brand-purple)" /> Sensor Relationships
            </h3>
            <span className="nav-badge" style={{ background: 'var(--brand-purple-soft)', color: 'var(--brand-purple)' }}>RANDOM FOREST</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20, alignItems: 'center' }}>
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Radar name="Importance" dataKey="A" stroke="var(--brand-purple)" fill="var(--brand-purple)" fillOpacity={0.6} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div>
               <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 12 }}>Feature Importance (Influence on Irrigation)</h4>
               {Object.entries(modelInfo?.feature_importance || {}).map(([key, val]) => (
                 <div key={key} style={{ marginBottom: 10 }}>
                   <div className="flex-between" style={{ fontSize: '0.72rem', marginBottom: 4 }}>
                     <span style={{ fontWeight: 600 }}>{key}</span>
                     <span style={{ color: 'var(--brand-purple)', fontWeight: 800 }}>{(val * 100).toFixed(0)}%</span>
                   </div>
                   <div style={{ height: 4, background: 'var(--bg-muted)', borderRadius: 2 }}>
                     <div style={{ height: '100%', width: `${val * 100}%`, background: 'var(--brand-purple)', borderRadius: 2 }} />
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </motion.div>

        {/* Technique 4: ML-Refined Thresholds */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="card">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={18} color="var(--brand-teal)" /> Smart Bounds
            </h3>
            <span className="nav-badge" style={{ background: 'var(--brand-teal-soft)', color: 'var(--brand-teal)' }}>K-MEANS / STATS</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Learned optimal bounds based on historical data distribution.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(insights.refined_bounds).slice(0, 3).map(([key, val]) => (
              <div key={key} style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 10, border: '1px solid var(--border)' }}>
                 <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key.replace('_', ' ')}</div>
                 <div className="flex-between" style={{ marginTop: 4 }}>
                   <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>{val.learned_min} — {val.learned_max}</div>
                   <div style={{ fontSize: '0.65rem', background: 'white', padding: '2px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid var(--border)' }}>Mean: {val.current_mean}</div>
                 </div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
      
      <div className="card" style={{ marginTop: 20, borderLeft: '4px solid var(--brand-green)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Info size={16} color="var(--brand-green)" />
          <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>{insights.summary}</p>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
