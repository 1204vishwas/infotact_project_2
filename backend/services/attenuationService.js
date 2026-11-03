/**
 * ProxiSpeak Audio Attenuation Service (Backend CommonJS)
 * Infotact Solutions — Geospatial Proximity Audio Ecosystem
 *
 * Provides server-side validation and calculation for volume attenuation algorithms.
 */

const ATTENUATION_MODELS = {
  EXPONENTIAL: 'exponential',
  SMOOTHSTEP: 'smoothstep',
  INVERSE: 'inverse',
  LINEAR: 'linear',
  LOGARITHMIC: 'logarithmic'
};

const DEFAULT_ATTENUATION_CONFIG = {
  model: ATTENUATION_MODELS.EXPONENTIAL,
  minRadius: 15,
  maxRadius: 100,
  hysteresisRadius: 115,
  minGain: 0.05,
  rolloff: 1.0,
  exponentialAlpha: 2.4,
  maxDecibels: 40,
  enableAirAbsorption: true,
  filterCeilingHz: 20000,
  filterFloorHz: 900,
  filterExponent: 1.6,
  panMaxRadius: 100
};

function normalizeDistance(distance, minRadius, maxRadius) {
  if (distance <= minRadius) return 0;
  if (distance >= maxRadius) return 1;
  const range = maxRadius - minRadius;
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, (distance - minRadius) / range));
}

function calculateLinearGain(distance, options = {}) {
  const { minRadius = 15, maxRadius = 100, minGain = 0.05 } = options;
  if (distance <= minRadius) return 1.0;
  if (distance >= maxRadius) return 0.0;
  const t = normalizeDistance(distance, minRadius, maxRadius);
  return minGain + (1.0 - minGain) * (1.0 - t);
}

function calculateExponentialGain(distance, options = {}) {
  const { minRadius = 15, maxRadius = 100, minGain = 0.05, exponentialAlpha = 2.4 } = options;
  if (distance <= minRadius) return 1.0;
  if (distance >= maxRadius) return 0.0;
  const t = normalizeDistance(distance, minRadius, maxRadius);
  const alpha = Math.max(0.1, exponentialAlpha);
  const expT = Math.exp(-alpha * t);
  const expAlpha = Math.exp(-alpha);
  const normalized = (expT - expAlpha) / (1.0 - expAlpha);
  return minGain + (1.0 - minGain) * Math.min(1.0, Math.max(0, normalized));
}

function calculateInverseGain(distance, options = {}) {
  const { minRadius = 15, maxRadius = 100, minGain = 0.05, rolloff = 1.0 } = options;
  if (distance <= minRadius) return 1.0;
  if (distance >= maxRadius) return 0.0;
  const dRef = Math.max(5, minRadius);
  const rawGain = dRef / (dRef + rolloff * (distance - dRef));
  const rawMax = dRef / (dRef + rolloff * (maxRadius - dRef));
  const normalized = (rawGain - rawMax) / (1.0 - rawMax);
  return minGain + (1.0 - minGain) * Math.min(1.0, Math.max(0, normalized));
}

function calculateSmoothstepGain(distance, options = {}) {
  const { minRadius = 15, maxRadius = 100, minGain = 0.05 } = options;
  if (distance <= minRadius) return 1.0;
  if (distance >= maxRadius) return 0.0;
  const t = normalizeDistance(distance, minRadius, maxRadius);
  const smooth = 1.0 - (3 * t * t - 2 * t * t * t);
  return minGain + (1.0 - minGain) * Math.min(1.0, Math.max(0, smooth));
}

function calculateLogarithmicGain(distance, options = {}) {
  const { minRadius = 15, maxRadius = 100, maxDecibels = 40 } = options;
  if (distance <= minRadius) return 1.0;
  if (distance >= maxRadius) return 0.0;
  const t = normalizeDistance(distance, minRadius, maxRadius);
  const dbLoss = -Math.abs(maxDecibels) * t;
  const linearGain = Math.pow(10, dbLoss / 20);
  return Math.min(1.0, Math.max(0.0, linearGain));
}

function calculateHysteresisFade(distance, baseGainAtMax, maxRadius = 100, hysteresisRadius = 115) {
  if (distance <= maxRadius) return baseGainAtMax;
  if (distance >= hysteresisRadius) return 0.0;
  const range = hysteresisRadius - maxRadius;
  if (range <= 0) return 0.0;
  const progress = (distance - maxRadius) / range;
  const cushion = Math.cos((Math.PI / 2) * progress);
  return Math.max(0.0, baseGainAtMax * (cushion * cushion));
}

function calculateFilterCutoff(distance, options = {}) {
  const {
    enableAirAbsorption = true,
    minRadius = 15,
    maxRadius = 100,
    filterCeilingHz = 20000,
    filterFloorHz = 900,
    filterExponent = 1.6
  } = options;

  if (!enableAirAbsorption) return filterCeilingHz;
  if (distance <= minRadius) return filterCeilingHz;
  if (distance >= maxRadius) return filterFloorHz;

  const t = normalizeDistance(distance, minRadius, maxRadius);
  const remaining = 1.0 - t;
  const freq = filterFloorHz + (filterCeilingHz - filterFloorHz) * Math.pow(remaining, filterExponent);
  return Math.round(Math.min(filterCeilingHz, Math.max(filterFloorHz, freq)));
}

function calculateStereoPan(deltaX, panMaxRadius = 100) {
  if (typeof deltaX !== 'number' || isNaN(deltaX)) return 0.0;
  const maxPan = Math.max(10, panMaxRadius);
  const pan = deltaX / maxPan;
  return Math.min(1.0, Math.max(-1.0, Number(pan.toFixed(3))));
}

function calculateAttenuation(distance, customConfig = {}) {
  const config = { ...DEFAULT_ATTENUATION_CONFIG, ...customConfig };
  const {
    model = ATTENUATION_MODELS.EXPONENTIAL,
    minRadius = 15,
    maxRadius = 100,
    hysteresisRadius = 115,
    minGain = 0.05,
    deltaX = null,
    panMaxRadius = 100,
    isCulled = false
  } = config;

  const validDist = Math.max(0, typeof distance === 'number' && !isNaN(distance) ? distance : Infinity);

  if (isCulled || validDist >= hysteresisRadius) {
    return {
      gain: 0.0,
      gainPercent: 0,
      decibels: -Infinity,
      filterFreq: config.filterFloorHz || 900,
      pan: deltaX !== null ? calculateStereoPan(deltaX, panMaxRadius) : 0.0,
      isAudible: false,
      inHysteresis: false,
      isCulled: !!isCulled,
      model,
      distance: Math.round(validDist)
    };
  }

  let rawGain = 0;
  switch (model) {
    case ATTENUATION_MODELS.LINEAR:
      rawGain = calculateLinearGain(validDist, config);
      break;
    case ATTENUATION_MODELS.INVERSE:
      rawGain = calculateInverseGain(validDist, config);
      break;
    case ATTENUATION_MODELS.SMOOTHSTEP:
      rawGain = calculateSmoothstepGain(validDist, config);
      break;
    case ATTENUATION_MODELS.LOGARITHMIC:
      rawGain = calculateLogarithmicGain(validDist, config);
      break;
    case ATTENUATION_MODELS.EXPONENTIAL:
    default:
      rawGain = calculateExponentialGain(validDist, config);
      break;
  }

  let finalGain = rawGain;
  const inHysteresis = validDist > maxRadius && validDist < hysteresisRadius;
  if (inHysteresis) {
    const baseAtMax = minGain;
    finalGain = calculateHysteresisFade(validDist, baseAtMax, maxRadius, hysteresisRadius);
  }

  finalGain = Math.min(1.0, Math.max(0.0, finalGain));
  const filterFreq = calculateFilterCutoff(validDist, config);
  const pan = deltaX !== null ? calculateStereoPan(deltaX, panMaxRadius) : 0.0;
  const decibels = finalGain > 0.00001 ? Number((20 * Math.log10(finalGain)).toFixed(1)) : -60.0;

  return {
    gain: Number(finalGain.toFixed(4)),
    gainPercent: Math.round(finalGain * 100),
    decibels,
    filterFreq,
    pan,
    isAudible: finalGain > 0.001,
    inHysteresis,
    isCulled: false,
    model,
    distance: Math.round(validDist)
  };
}

module.exports = {
  ATTENUATION_MODELS,
  DEFAULT_ATTENUATION_CONFIG,
  calculateLinearGain,
  calculateExponentialGain,
  calculateInverseGain,
  calculateSmoothstepGain,
  calculateLogarithmicGain,
  calculateHysteresisFade,
  calculateFilterCutoff,
  calculateStereoPan,
  calculateAttenuation
};
