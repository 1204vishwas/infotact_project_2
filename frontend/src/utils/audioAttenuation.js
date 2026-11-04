/**
 * ProxiSpeak Audio Attenuation & Spatial Web Audio Engine
 * Infotact Solutions — Geospatial Proximity Audio Ecosystem
 *
 * Implements mathematical algorithms to calculate dynamic volume drop-off,
 * acoustic high-frequency air absorption, binaural stereo panning, and
 * hysteresis boundary cushioning based on 2D pixel distance.
 */

export const ATTENUATION_MODELS = {
  EXPONENTIAL: 'exponential',
  SMOOTHSTEP: 'smoothstep',
  INVERSE: 'inverse',
  LINEAR: 'linear',
  LOGARITHMIC: 'logarithmic'
};

export const ATTENUATION_MODEL_METADATA = {
  [ATTENUATION_MODELS.EXPONENTIAL]: {
    name: 'Exponential / Psychoacoustic',
    shortName: 'Exponential',
    description: 'Models human ear logarithmic loudness perception (Weber-Fechner Law). Gentle near, steep fade distant.',
    formula: 'G(d) = (e^(-α·t) - e^(-α)) / (1 - e^(-α))',
    recommended: true
  },
  [ATTENUATION_MODELS.SMOOTHSTEP]: {
    name: 'Smoothstep (Hermite S-Curve)',
    shortName: 'Smoothstep',
    description: 'Smooth cubic curve with zero derivatives at inner & outer boundaries. Natural "conversational bubble".',
    formula: 'G(d) = 1 - (3t² - 2t³)',
    recommended: false
  },
  [ATTENUATION_MODELS.INVERSE]: {
    name: 'Inverse Distance (OpenAL Standard)',
    shortName: 'Inverse Distance',
    description: 'Acoustic Inverse Square Law approximation used in game engines and spatial computing.',
    formula: 'G(d) = d_ref / (d_ref + rolloff · (d - d_ref))',
    recommended: false
  },
  [ATTENUATION_MODELS.LINEAR]: {
    name: 'Linear Attenuation',
    shortName: 'Linear',
    description: 'Even, straight-line volume decline across earshot radius. Highly predictable and intuitive.',
    formula: 'G(d) = 1 - t',
    recommended: false
  },
  [ATTENUATION_MODELS.LOGARITHMIC]: {
    name: 'Logarithmic Decibel (-40 dB)',
    shortName: 'Logarithmic dB',
    description: 'Direct decibel reduction over distance converted to linear amplitude for audio mixing boards.',
    formula: 'dB(d) = -40 · t,  G(d) = 10^(dB / 20)',
    recommended: false
  }
};

export const DEFAULT_ATTENUATION_CONFIG = {
  model: ATTENUATION_MODELS.EXPONENTIAL,
  minRadius: 15,          // Inner conversational sweet spot (0 to 15px = 100% volume)
  maxRadius: 100,         // Earshot threshold boundary (100px)
  hysteresisRadius: 115,  // Connection buffer boundary (100px to 115px soft fade)
  minGain: 0.05,          // Minimum audible gain floor before cutoff (5%)
  rolloff: 1.0,           // Drop-off aggressiveness multiplier
  exponentialAlpha: 2.4,  // Exponential decay constant
  maxDecibels: 40,        // Maximum decibel attenuation at outer boundary (-40 dB)
  enableAirAbsorption: true, // Distance-based lowpass filter (high frequency absorption)
  filterCeilingHz: 20000, // Close-up full fidelity frequency
  filterFloorHz: 900,     // Distant muffled frequency
  filterExponent: 1.6,    // Rate of high-frequency loss
  panMaxRadius: 100       // Maximum pixel offset for full ±1.0 stereo separation
};

/**
 * Normalizes pixel distance into [0, 1] relative to minRadius and maxRadius
 */
function normalizeDistance(distance, minRadius, maxRadius) {
  if (distance <= minRadius) return 0;
  if (distance >= maxRadius) return 1;
  const range = maxRadius - minRadius;
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, (distance - minRadius) / range));
}

/**
 * 1. Linear Volume Attenuation Algorithm
 * Drops off along a uniform slope from minRadius to maxRadius.
 */
export function calculateLinearGain(distance, options = {}) {
  const { minRadius = 15, maxRadius = 100, minGain = 0.05 } = options;
  if (distance <= minRadius) return 1.0;
  if (distance >= maxRadius) return 0.0;
  const t = normalizeDistance(distance, minRadius, maxRadius);
  return minGain + (1.0 - minGain) * (1.0 - t);
}

/**
 * 2. Exponential / Psychoacoustic Volume Attenuation Algorithm
 * Replicates logarithmic human hearing response.
 */
export function calculateExponentialGain(distance, options = {}) {
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

/**
 * 3. Inverse Distance (OpenAL Standard) Volume Attenuation Algorithm
 * Approximates physical Inverse Square Law with reference radius.
 */
export function calculateInverseGain(distance, options = {}) {
  const { minRadius = 15, maxRadius = 100, minGain = 0.05, rolloff = 1.0 } = options;
  if (distance <= minRadius) return 1.0;
  if (distance >= maxRadius) return 0.0;
  const dRef = Math.max(5, minRadius);
  const rawGain = dRef / (dRef + rolloff * (distance - dRef));
  const rawMax = dRef / (dRef + rolloff * (maxRadius - dRef));
  // Re-scale so gain reaches minGain at maxRadius
  const normalized = (rawGain - rawMax) / (1.0 - rawMax);
  return minGain + (1.0 - minGain) * Math.min(1.0, Math.max(0, normalized));
}

/**
 * 4. Smoothstep S-Curve Volume Attenuation Algorithm
 * Uses cubic Hermite smoothstep (3t^2 - 2t^3) for soft transitions.
 */
export function calculateSmoothstepGain(distance, options = {}) {
  const { minRadius = 15, maxRadius = 100, minGain = 0.05 } = options;
  if (distance <= minRadius) return 1.0;
  if (distance >= maxRadius) return 0.0;
  const t = normalizeDistance(distance, minRadius, maxRadius);
  const smooth = 1.0 - (3 * t * t - 2 * t * t * t);
  return minGain + (1.0 - minGain) * Math.min(1.0, Math.max(0, smooth));
}

/**
 * 5. Logarithmic Decibel Volume Attenuation Algorithm
 * Computes decibel loss and converts to linear amplitude.
 */
export function calculateLogarithmicGain(distance, options = {}) {
  const { minRadius = 15, maxRadius = 100, maxDecibels = 40 } = options;
  if (distance <= minRadius) return 1.0;
  if (distance >= maxRadius) return 0.0;
  const t = normalizeDistance(distance, minRadius, maxRadius);
  const dbLoss = -Math.abs(maxDecibels) * t;
  const linearGain = Math.pow(10, dbLoss / 20);
  return Math.min(1.0, Math.max(0.0, linearGain));
}

/**
 * Hysteresis Boundary Cushion Algorithm
 * Smoothly fades audio to zero when peer moves between maxRadius (100px) and hysteresisRadius (115px).
 */
export function calculateHysteresisFade(distance, baseGainAtMax, maxRadius = 100, hysteresisRadius = 115) {
  if (distance <= maxRadius) return baseGainAtMax;
  if (distance >= hysteresisRadius) return 0.0;
  const range = hysteresisRadius - maxRadius;
  if (range <= 0) return 0.0;
  const progress = (distance - maxRadius) / range;
  // Cosine-squared soft fade for click-free de-zippering
  const cushion = Math.cos((Math.PI / 2) * progress);
  return Math.max(0.0, baseGainAtMax * (cushion * cushion));
}

/**
 * Distance-based Atmospheric Air Absorption (Acoustic Low-Pass Filter)
 * In real-world physics, air absorbs high frequencies faster than low frequencies.
 * Returns cutoff frequency in Hz [filterFloorHz, filterCeilingHz].
 */
export function calculateFilterCutoff(distance, options = {}) {
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

/**
 * Binaural 2D Spatial Stereo Panning
 * Computes stereo pan value between -1.0 (full left) and +1.0 (full right).
 */
export function calculateStereoPan(deltaX, panMaxRadius = 100) {
  if (typeof deltaX !== 'number' || isNaN(deltaX)) return 0.0;
  const maxPan = Math.max(10, panMaxRadius);
  const pan = deltaX / maxPan;
  return Math.min(1.0, Math.max(-1.0, Number(pan.toFixed(3))));
}

/**
 * MASTER ATTENUATION CALCULATOR
 * Evaluates volume gain, lowpass filter cutoff, stereo pan, and decibels for any given pixel distance.
 */
export function calculateAttenuation(distance, customConfig = {}) {
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

  // Handle edge cases
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

  // 1. Calculate base gain inside [0, maxRadius]
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

  // 2. Apply hysteresis cushion if distance is between maxRadius and hysteresisRadius
  let finalGain = rawGain;
  const inHysteresis = validDist > maxRadius && validDist < hysteresisRadius;
  if (inHysteresis) {
    const baseAtMax = minGain;
    finalGain = calculateHysteresisFade(validDist, baseAtMax, maxRadius, hysteresisRadius);
  }

  finalGain = Math.min(1.0, Math.max(0.0, finalGain));

  // 3. Low-pass filter frequency
  const filterFreq = calculateFilterCutoff(validDist, config);

  // 4. Stereo pan
  const pan = deltaX !== null ? calculateStereoPan(deltaX, panMaxRadius) : 0.0;

  // 5. Decibel conversion (20 * log10(gain))
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

/**
 * Generate curve data points across distance spectrum for Canvas visualization
 */
export function generateAttenuationCurve(model = ATTENUATION_MODELS.EXPONENTIAL, options = {}, steps = 120) {
  const maxRange = (options.hysteresisRadius || 115) + 5;
  const stepSize = maxRange / steps;
  const points = [];

  for (let i = 0; i <= steps; i++) {
    const dist = i * stepSize;
    const result = calculateAttenuation(dist, { ...options, model });
    points.push({
      distance: Number(dist.toFixed(1)),
      gain: result.gain,
      gainPercent: result.gainPercent,
      decibels: result.decibels,
      filterFreq: result.filterFreq,
      inHysteresis: result.inHysteresis
    });
  }

  return points;
}

/**
 * 2D Line Segment vs Axis-Aligned Bounding Box (AABB) Intersection
 * Uses Liang-Barsky parametric clipping algorithm.
 */
export function lineIntersectsBox(x1, y1, x2, y2, box) {
  const xMin = box.x;
  const xMax = box.x + box.width;
  const yMin = box.y;
  const yMax = box.y + box.height;

  // Check if either point is inside the box
  if ((x1 >= xMin && x1 <= xMax && y1 >= yMin && y1 <= yMax) ||
      (x2 >= xMin && x2 <= xMax && y2 >= yMin && y2 <= yMax)) {
    return {
      intersects: true,
      t: 0,
      intersectionPoint: { x: x1, y: y1 }
    };
  }

  const dx = x2 - x1;
  const dy = y2 - y1;

  const p = [-dx, dx, -dy, dy];
  const q = [x1 - xMin, xMax - x1, y1 - yMin, yMax - y1];

  let u1 = 0;
  let u2 = 1;

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return { intersects: false };
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > u2) return { intersects: false };
        if (t > u1) u1 = t;
      } else {
        if (t < u1) return { intersects: false };
        if (t < u2) u2 = t;
      }
    }
  }

  if (u1 <= u2) {
    const hitX = Math.round((x1 + u1 * dx) * 10) / 10;
    const hitY = Math.round((y1 + u1 * dy) * 10) / 10;
    return {
      intersects: true,
      t: u1,
      intersectionPoint: { x: hitX, y: hitY }
    };
  }

  return { intersects: false };
}

/**
 * Checks if line of sight between two avatars is occluded by any furniture obstacle
 * that blocks sound (blocksSound: true).
 */
export function checkSoundOcclusion(locA, locB, obstacles = []) {
  if (!locA || !locB) {
    return { isBlocked: false, blockingObstacles: [], blockingObstacle: null };
  }

  const x1 = Array.isArray(locA) ? locA[0] : locA.x;
  const y1 = Array.isArray(locA) ? locA[1] : locA.y;
  const x2 = Array.isArray(locB) ? locB[0] : locB.x;
  const y2 = Array.isArray(locB) ? locB[1] : locB.y;

  const blockingObstacles = [];
  let firstIntersection = null;

  for (const obs of obstacles) {
    if (!obs || !obs.blocksSound) continue;

    const hit = lineIntersectsBox(x1, y1, x2, y2, obs);
    if (hit.intersects) {
      blockingObstacles.push({
        ...obs,
        hitPoint: hit.intersectionPoint,
        hitT: hit.t
      });
      if (!firstIntersection || hit.t < firstIntersection.hitT) {
        firstIntersection = { ...obs, hitPoint: hit.intersectionPoint, hitT: hit.t };
      }
    }
  }

  const isBlocked = blockingObstacles.length > 0;
  return {
    isBlocked,
    blockingObstacle: firstIntersection,
    blockingObstacles,
    blockCount: blockingObstacles.length,
    reason: isBlocked ? `Sound blocked by '${firstIntersection.label}'` : 'Clear line of sight'
  };
}
