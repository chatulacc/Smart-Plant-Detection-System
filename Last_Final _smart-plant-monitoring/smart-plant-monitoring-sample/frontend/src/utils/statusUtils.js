/**
 * Centralized utility for greenhouse status logic
 */

export const getSensorStatus = (value, type, thresholds) => {
  if (value === null || value === undefined) {
    return { label: '--', color: 'var(--text-muted)', status: 'nominal' };
  }

  const keyMap = {
    'Soil Moisture': 'soil',
    'Temperature': 'temp',
    'Humidity': 'hum',
    'Light Intensity': 'light'
  };

  const key = keyMap[type] || type;
  const thresh = thresholds[key];

  if (!thresh) return { label: 'Healthy', color: 'var(--brand-green)', status: 'nominal' };

  const { min, max } = thresh;
  const buffer = (max - min) * 0.15; // 15% buffer for sub-optimal zones

  // Critical Low
  if (value < min - buffer) {
    return {
      label: type === 'Soil Moisture' ? 'Parched (Critical)' : type === 'Temperature' ? 'Frigid' : type === 'Humidity' ? 'Arid' : 'Too Dark',
      color: 'var(--brand-red)',
      status: 'critical-low'
    };
  }

  // Sub-optimal Low
  if (value < min) {
    return {
      label: type === 'Soil Moisture' ? 'Moisture Deficit' : type === 'Temperature' ? 'Cool' : type === 'Humidity' ? 'Low Humidity' : 'Dim',
      color: 'var(--brand-amber)',
      status: 'sub-optimal-low'
    };
  }

  // Critical High
  if (value > max + buffer) {
    return {
      label: type === 'Soil Moisture' ? 'Saturated' : type === 'Temperature' ? 'Heat Stress' : type === 'Humidity' ? 'Excessive' : 'Too Bright',
      color: 'var(--brand-red)',
      status: 'critical-high'
    };
  }

  // Sub-optimal High
  if (value > max) {
    return {
      label: type === 'Soil Moisture' ? 'Damp' : type === 'Temperature' ? 'Warm' : type === 'Humidity' ? 'Humid' : 'Bright',
      color: 'var(--brand-amber)',
      status: 'sub-optimal-high'
    };
  }

  // Optimal
  return {
    label: type === 'Temperature' ? 'Thermal Comfort' : type === 'Humidity' ? 'Ideal Balance' : 'Optimal Growth Zone',
    color: 'var(--brand-green)',
    status: 'optimal'
  };
};

export const computeDynamicHealthScore = (latest, thresholds) => {
  if (!latest || !thresholds) return 0;
  
  let score = 0;
  let count = 0;

  const sensors = [
    { val: latest.soil_moisture, key: 'soil' },
    { val: latest.air_temperature, key: 'temp' },
    { val: latest.air_humidity, key: 'hum' },
    { val: latest.ldr_light, key: 'light' }
  ];

  sensors.forEach(s => {
    if (s.val !== null && s.val !== undefined) {
      const thresh = thresholds[s.key];
      if (thresh) {
        const { min, max } = thresh;
        const buffer = (max - min) * 0.15;
        
        if (s.val >= min && s.val <= max) score += 100;
        else if (s.val >= min - buffer && s.val <= max + buffer) score += 60;
        else score += 20;
        
        count++;
      }
    }
  });

  return count > 0 ? Math.round(score / count) : 0;
};
