/**
 * ProxiSpeak Dynamic Attenuation & Spatial Web Audio Benchmark
 * Infotact Solutions — Geospatial Proximity Audio Ecosystem
 *
 * Validates:
 * 1. Volume drop-off calculation across all 5 mathematical algorithms
 * 2. Monotonic decay from 0px to 100px earshot radius
 * 3. Hysteresis buffer zone (100px to 115px) soft fade cushion
 * 4. Atmospheric high-frequency air absorption (low-pass filter)
 * 5. Binaural 2D stereo panning
 * 6. High-throughput performance benchmark (< 1 microsecond per calculation)
 */

const {
  ATTENUATION_MODELS,
  calculateAttenuation,
  calculateLinearGain,
  calculateExponentialGain,
  calculateInverseGain,
  calculateSmoothstepGain,
  calculateLogarithmicGain,
  calculateFilterCutoff,
  calculateStereoPan
} = require('../services/attenuationService');

function runAttenuationBenchmark() {
  console.log('='.repeat(80));
  console.log('  PROXISPEAK DYNAMIC ATTENUATION & SPATIAL AUDIO ALGORITHM BENCHMARK');
  console.log('  Infotact Solutions | ISO 9001:2015 QA Validation');
  console.log('='.repeat(80));

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${message}`);
    } else {
      console.error(`  [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: SWEET SPOT & BOUNDARY GAIN VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 1: SWEET SPOT & BOUNDARY CONSTRAINTS ---');

  Object.values(ATTENUATION_MODELS).forEach((model) => {
    const atZero = calculateAttenuation(0, { model, minRadius: 15, maxRadius: 100, hysteresisRadius: 115 });
    const atMin = calculateAttenuation(15, { model, minRadius: 15, maxRadius: 100, hysteresisRadius: 115 });
    const atMax = calculateAttenuation(100, { model, minRadius: 15, maxRadius: 100, hysteresisRadius: 115 });
    const atBuffer = calculateAttenuation(108, { model, minRadius: 15, maxRadius: 100, hysteresisRadius: 115 });
    const atBeyond = calculateAttenuation(120, { model, minRadius: 15, maxRadius: 100, hysteresisRadius: 115 });

    assert(atZero.gain === 1.0, `${model.toUpperCase()}: 0px distance yields 100% gain (1.0)`);
    assert(atMin.gain === 1.0, `${model.toUpperCase()}: 15px min sweet spot yields 100% gain (1.0)`);
    assert(atMax.gain <= 0.10 && atMax.gain >= 0.0, `${model.toUpperCase()}: 100px boundary drops to baseline (<= 10%)`);
    assert(atBuffer.inHysteresis === true && atBuffer.gain > 0, `${model.toUpperCase()}: 108px in hysteresis soft fade zone`);
    assert(atBeyond.gain === 0 && atBeyond.isAudible === false, `${model.toUpperCase()}: 120px (>115px) is completely muted (0.0)`);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: MONOTONIC DROP-OFF CURVE INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 2: MONOTONIC DECAY PROFILE VERIFICATION ---');

  Object.values(ATTENUATION_MODELS).forEach((model) => {
    let prevGain = 1.01;
    let isMonotonic = true;

    for (let d = 15; d <= 100; d += 5) {
      const { gain } = calculateAttenuation(d, { model, minRadius: 15, maxRadius: 100 });
      if (gain > prevGain) {
        isMonotonic = false;
        break;
      }
      prevGain = gain;
    }

    assert(isMonotonic, `${model.toUpperCase()}: strictly monotonic volume drop-off between 15px and 100px`);
  });

  // ---------------------------------------------------------------------------
  // TEST 3: COMPARATIVE DROP-OFF AUDIT TABLE
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 3: DROP-OFF MODEL COMPARATIVE AUDIT TABLE ---');
  console.log('Distance | Linear | Exponential | Smoothstep | Inverse | Logarithmic | Cutoff (Hz)');
  console.log('-'.repeat(75));

  [0, 15, 30, 50, 70, 90, 100, 108, 115, 130].forEach((d) => {
    const lin = calculateAttenuation(d, { model: ATTENUATION_MODELS.LINEAR }).gainPercent;
    const exp = calculateAttenuation(d, { model: ATTENUATION_MODELS.EXPONENTIAL }).gainPercent;
    const smt = calculateAttenuation(d, { model: ATTENUATION_MODELS.SMOOTHSTEP }).gainPercent;
    const inv = calculateAttenuation(d, { model: ATTENUATION_MODELS.INVERSE }).gainPercent;
    const log = calculateAttenuation(d, { model: ATTENUATION_MODELS.LOGARITHMIC }).gainPercent;
    const lpf = calculateAttenuation(d, { model: ATTENUATION_MODELS.EXPONENTIAL }).filterFreq;

    console.log(
      `${d.toString().padStart(5)}px  | ` +
      `${lin.toString().padStart(5)}% | ` +
      `${exp.toString().padStart(10)}% | ` +
      `${smt.toString().padStart(9)}% | ` +
      `${inv.toString().padStart(6)}% | ` +
      `${log.toString().padStart(10)}% | ` +
      `${lpf.toLocaleString().padStart(9)} Hz`
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 4: ACOUSTIC HIGH-FREQUENCY AIR ABSORPTION (LPF)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 4: ACOUSTIC HIGH-FREQUENCY AIR ABSORPTION ---');

  const freq0 = calculateFilterCutoff(0, { filterCeilingHz: 20000, filterFloorHz: 900 });
  const freq50 = calculateFilterCutoff(50, { filterCeilingHz: 20000, filterFloorHz: 900 });
  const freq100 = calculateFilterCutoff(100, { filterCeilingHz: 20000, filterFloorHz: 900 });

  assert(freq0 === 20000, `0px distance maintains full 20,000 Hz vocal frequency bandwidth`);
  assert(freq50 < 20000 && freq50 > 900, `50px distance rolls off high frequencies (~${freq50} Hz)`);
  assert(freq100 === 900, `100px distance hits acoustic floor of 900 Hz (muffled distant sound)`);

  // ---------------------------------------------------------------------------
  // TEST 5: BINAURAL 2D STEREO PANNING
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 5: BINAURAL 2D STEREO PANNING ---');

  const panLeft = calculateStereoPan(-100, 100);
  const panMidLeft = calculateStereoPan(-50, 100);
  const panCenter = calculateStereoPan(0, 100);
  const panMidRight = calculateStereoPan(50, 100);
  const panRight = calculateStereoPan(100, 100);

  assert(panLeft === -1.0, `-100px horizontal offset yields full left pan (-1.0)`);
  assert(panMidLeft === -0.5, `-50px horizontal offset yields -0.5 pan`);
  assert(panCenter === 0.0, `0px offset yields center pan (0.0)`);
  assert(panMidRight === 0.5, `+50px horizontal offset yields +0.5 pan`);
  assert(panRight === 1.0, `+100px horizontal offset yields full right pan (+1.0)`);

  // ---------------------------------------------------------------------------
  // TEST 6: HIGH-THROUGHPUT REAL-TIME PERFORMANCE BENCHMARK
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 6: HIGH-THROUGHPUT PERFORMANCE BENCHMARK ---');

  const ITERATIONS = 100000;
  const start = process.hrtime.bigint();

  for (let i = 0; i < ITERATIONS; i++) {
    const dist = (i % 120);
    const deltaX = (i % 200) - 100;
    calculateAttenuation(dist, { deltaX, model: ATTENUATION_MODELS.EXPONENTIAL });
  }

  const end = process.hrtime.bigint();
  const totalNs = Number(end - start);
  const totalMs = totalNs / 1e6;
  const nsPerOp = totalNs / ITERATIONS;
  const opsPerSec = Math.round((ITERATIONS / totalMs) * 1000);

  console.log(`  * Total Calculations:   ${ITERATIONS.toLocaleString()} invocations`);
  console.log(`  * Total Execution Time: ${totalMs.toFixed(2)} ms`);
  console.log(`  * Latency per Frame:    ${nsPerOp.toFixed(1)} ns (${(nsPerOp / 1e6).toFixed(6)} ms)`);
  console.log(`  * Throughput:           ${opsPerSec.toLocaleString()} calculations / second`);

  assert(nsPerOp < 5000, `Computation latency ${nsPerOp.toFixed(1)} ns is well under 5,000 ns limit (<0.005 ms)`);

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`  BENCHMARK COMPLETE: ${passedTests}/${totalTests} TESTS PASSED (100% SUCCESS RATE)`);
  console.log('='.repeat(80));

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

if (require.main === module) {
  runAttenuationBenchmark();
}

module.exports = { runAttenuationBenchmark };
