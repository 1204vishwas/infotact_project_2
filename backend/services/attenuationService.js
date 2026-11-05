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
  panMaxRadius: 100,
  enable3DAudio: true,
  panningMode: 'hrtf',
  stereoSeparation: 1.0,
  minSeparationRadius: 12
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

function calculate3DStereoPan(deltaX, deltaY = 0, deltaZ = 0, options = {}) {
  const {
    panMaxRadius = 100,
    stereoSeparation = 1.0,
    minSeparationRadius = 12
  } = options;

  if (typeof deltaX !== 'number' || isNaN(deltaX)) {
    return {
      pan: 0.0,
      azimuthDeg: 0,
      elevationDeg: 0,
      itdMs: 0,
      ildDb: 0,
      rearOcclusionFactor: 1.0,
      distance3D: 0,
      stereoSeparation
    };
  }

  const dX = deltaX;
  const dY = typeof deltaY === 'number' && !isNaN(deltaY) ? deltaY : 0;
  const dZ = typeof deltaZ === 'number' && !isNaN(deltaZ) ? deltaZ : 0;

  const horizontalDist = Math.hypot(dX, dY);
  const distance3D = Math.hypot(dX, dY, dZ);

  const azimuthRad = Math.atan2(dX, -dY);
  const azimuthDeg = Math.round((azimuthRad * 180) / Math.PI);

  const elevationRad = Math.atan2(dZ, Math.max(1, horizontalDist));
  const elevationDeg = Math.round((elevationRad * 180) / Math.PI);

  let rawPan = Math.sin(azimuthRad) * stereoSeparation;
  const taper = horizontalDist < minSeparationRadius ? Math.max(0, horizontalDist / minSeparationRadius) : 1.0;
  const pan = Math.min(1.0, Math.max(-1.0, Number((rawPan * taper).toFixed(3))));

  const itdMs = Number((0.65 * Math.sin(Math.abs(azimuthRad))).toFixed(3));
  const ildDb = Number((6.5 * Math.abs(pan)).toFixed(1));

  const isBehind = dY > 0;
  const rearOcclusionFactor = isBehind ? Math.max(0.82, 1.0 - (dY / Math.max(1, panMaxRadius)) * 0.18) : 1.0;

  return {
    pan,
    azimuthDeg,
    elevationDeg,
    itdMs,
    ildDb,
    rearOcclusionFactor: Number(rearOcclusionFactor.toFixed(3)),
    distance3D: Math.round(distance3D),
    stereoSeparation
  };
}

function calculateStereoPan(deltaX, panMaxRadius = 100, deltaY = null, stereoSeparation = 1.0) {
  if (typeof deltaX !== 'number' || isNaN(deltaX)) return 0.0;
  if (deltaY === null || deltaY === undefined) {
    const maxPan = Math.max(10, panMaxRadius);
    const pan = deltaX / maxPan;
    return Math.min(1.0, Math.max(-1.0, Number(pan.toFixed(3))));
  }
  const result = calculate3DStereoPan(deltaX, deltaY, 0, { panMaxRadius, stereoSeparation });
  return result.pan;
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
    deltaY = null,
    deltaZ = 0,
    panMaxRadius = 100,
    stereoSeparation = 1.0,
    isCulled = false
  } = config;

  const validDist = Math.max(0, typeof distance === 'number' && !isNaN(distance) ? distance : Infinity);

  const spatial3D = deltaX !== null
    ? calculate3DStereoPan(deltaX, deltaY, deltaZ, { panMaxRadius, stereoSeparation })
    : { pan: 0.0, azimuthDeg: 0, elevationDeg: 0, itdMs: 0, ildDb: 0, rearOcclusionFactor: 1.0, stereoSeparation };

  const pan = deltaX !== null ? spatial3D.pan : 0.0;

  if (isCulled || validDist >= hysteresisRadius) {
    return {
      gain: 0.0,
      gainPercent: 0,
      decibels: -Infinity,
      filterFreq: config.filterFloorHz || 900,
      pan,
      spatial3D,
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
  let filterFreq = calculateFilterCutoff(validDist, config);
  if (spatial3D.rearOcclusionFactor < 1.0) {
    filterFreq = Math.round(Math.max(config.filterFloorHz || 900, filterFreq * spatial3D.rearOcclusionFactor));
  }

  const decibels = finalGain > 0.00001 ? Number((20 * Math.log10(finalGain)).toFixed(1)) : -60.0;

  return {
    gain: Number(finalGain.toFixed(4)),
    gainPercent: Math.round(finalGain * 100),
    decibels,
    filterFreq,
    pan,
    spatial3D,
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
  calculate3DStereoPan,
  calculateAttenuation
};
