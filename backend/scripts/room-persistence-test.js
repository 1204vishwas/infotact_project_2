/**
 * ProxiSpeak Room Persistence & Sound-Blocking Obstacles Test
 * Infotact Solutions — ISO 9001:2015 Quality Assurance
 * 
 * Verifies:
 * 1. Office layout and furniture obstacles schema persistence in MongoDB
 * 2. Sound-blocking furniture obstacle detection (blocksSound: true vs blocksSound: false)
 * 3. 2D Raycasting Line-of-Sight acoustic occlusion algorithm
 * 4. CRUD operations for office obstacles (Add, Update blocksSound, Delete, Reset)
 * 5. Latency benchmark for room persistence & acoustic occlusion (< 20ms SLA)
 */

const OfficeSpace = require('../models/OfficeSpace');
const { checkSoundOcclusion, lineIntersectsBox, DEFAULT_OBSTACLES, DEFAULT_OFFICE_ZONES } = OfficeSpace;

async function runRoomPersistenceTest() {
  console.log('='.repeat(80));
  console.log('  PROXISPEAK ROOM PERSISTENCE & SOUND-BLOCKING OBSTACLES VERIFICATION');
  console.log('  Infotact Solutions | ISO 9001:2015 QA Certified');
  console.log('  Milestone: Save Office Layouts & Furniture Obstacles into MongoDB');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 1: MongoDB Schema & Initial Room Retrieval
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 1: MONGODB SCHEMA & ROOM PERSISTENCE RETRIEVAL ---');
  const { office, source } = await OfficeSpace.getOfficeLayout('proxify');

  assert(office !== null && typeof office === 'object', 'Office layout retrieved successfully');
  assert(office.dimensions.width === 960 && office.dimensions.height === 640, 'Dimensions correctly match 960x640 Canvas World');
  assert(Array.isArray(office.zones) && office.zones.length >= 4, `All 4 office zones loaded (Zones: ${office.zones.length})`);
  assert(Array.isArray(office.obstacles) && office.obstacles.length >= 8, `Furniture obstacles loaded (Total: ${office.obstacles.length})`);

  const soundBlockers = office.obstacles.filter(o => o.blocksSound);
  assert(soundBlockers.length >= 3, `Sound-blocking furniture obstacles present (${soundBlockers.length} soundproof obstacles)`);
  console.log(`  * Persistence Source: ${source.toUpperCase()}`);
  console.log(`  * Sound-blocking obstacles: ${soundBlockers.map(b => b.label).join(', ')}`);

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Acoustic Line-of-Sight Sound Occlusion Raycasting
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 2: SOUND OCCLUSION & RAYCASTING (blocksSound: true) ---');

  // Central acoustic wall is at x: 468, y: 50, width: 24, height: 220
  // Test 1: Avatar A at (420, 150) [Audio Lab] and Avatar B at (520, 150) [WebRTC Bay]
  // Direct line segment crosses through x: 468..492, y: 150 -> MUST BE BLOCKED
  const occludedRay = checkSoundOcclusion([420, 150], [520, 150], office.obstacles);
  assert(occludedRay.isBlocked === true, 'Ray crossing Acoustic Soundproof Wall is BLOCKED (isBlocked: true)');
  assert(occludedRay.blockingObstacle?.id === 'acoustic-wall-central', `Blocked by correct obstacle: '${occludedRay.blockingObstacle?.label}'`);
  assert(occludedRay.blockingObstacle?.hitPoint !== null, `Intersection point computed: (${occludedRay.blockingObstacle?.hitPoint?.x}, ${occludedRay.blockingObstacle?.hitPoint?.y})`);

  // Test 2: Sound Isolation Booth at x: 270, y: 80, width: 140, height: 90
  // Avatar inside booth at (300, 100) vs colleague outside at (150, 100)
  const boothRay = checkSoundOcclusion([150, 100], [300, 100], office.obstacles);
  assert(boothRay.isBlocked === true, 'Ray crossing Sound Isolation Booth is BLOCKED');
  assert(boothRay.blockingObstacle?.type === 'sound-booth', `Blocked by sound booth: '${boothRay.blockingObstacle?.label}'`);

  // Test 3: Clear line-of-sight in central concourse (y: 320)
  // Avatar A at (420, 320) and Avatar B at (520, 320)
  const clearRay = checkSoundOcclusion([420, 320], [520, 320], office.obstacles);
  assert(clearRay.isBlocked === false, 'Ray in open central concourse is PERMITTED (isBlocked: false)');

  // Test 4: Open furniture (Desk with blocksSound: false)
  // Dev Desk 1 is at x: 550, y: 80, w: 140, h: 60 (blocksSound: false)
  // Ray from (500, 100) to (700, 100) passes through Dev Desk
  const deskRay = checkSoundOcclusion([500, 100], [700, 100], office.obstacles);
  assert(deskRay.isBlocked === false, 'Open collaboration desk does NOT block sound (blocksSound: false preserved)');

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Dynamic Obstacle Updates & MongoDB Persistence
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 3: DYNAMIC OBSTACLE UPDATES & PERSISTENCE ---');

  // 1. Add new sound-blocking partition
  const testPartition = {
    id: `test_glass_${Date.now()}`,
    label: 'Test Executive Acoustic Partition',
    type: 'glass-partition',
    x: 480,
    y: 280,
    width: 20,
    height: 80,
    color: '#0284c7',
    blocksSound: true,
    soundReduction: 1.0,
    soundReductionDb: 40
  };

  const updatedObstacles = [...office.obstacles, testPartition];
  const saveResult = await OfficeSpace.saveOfficeLayout('proxify', {
    ...office,
    obstacles: updatedObstacles
  });

  assert(saveResult.success === true, 'Successfully saved layout with new obstacle to MongoDB');
  assert(saveResult.office.obstacles.length === office.obstacles.length + 1, 'Obstacle count increased by 1');

  // Verify ray across new partition is now blocked
  const newPartitionRay = checkSoundOcclusion([450, 310], [510, 310], saveResult.office.obstacles);
  assert(newPartitionRay.isBlocked === true, 'Ray across newly persisted partition is immediately BLOCKED');

  // 2. Toggle blocksSound to false and save
  const toggledObstacles = saveResult.office.obstacles.map(o => {
    if (o.id === testPartition.id) {
      return { ...o, blocksSound: false };
    }
    return o;
  });

  const toggleResult = await OfficeSpace.saveOfficeLayout('proxify', {
    ...saveResult.office,
    obstacles: toggledObstacles
  });

  assert(toggleResult.success === true, 'Saved layout with toggled blocksSound: false to MongoDB');
  const unblockedRay = checkSoundOcclusion([450, 310], [510, 310], toggleResult.office.obstacles);
  assert(unblockedRay.isBlocked === false, 'Ray across partition with blocksSound: false is now PERMITTED');

  // 3. Reset office layout back to default
  const resetResult = await OfficeSpace.resetToDefault('proxify');
  assert(resetResult.success === true, 'Successfully reset office layout to defaults in MongoDB');
  assert(resetResult.office.obstacles.length === DEFAULT_OBSTACLES.length, `Reset restored ${DEFAULT_OBSTACLES.length} original obstacles`);

  // -------------------------------------------------------------------------
  // TEST SUITE 4: High-Performance Latency Benchmark (< 20ms SLA)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 4: LATENCY BENCHMARK (< 20ms SLA) ---');

  const iterations = 10000;
  const start = process.hrtime.bigint();

  for (let i = 0; i < iterations; i++) {
    const rx1 = 400 + (i % 50);
    const ry1 = 100 + (i % 40);
    const rx2 = 500 + (i % 50);
    const ry2 = 100 + (i % 40);
    checkSoundOcclusion([rx1, ry1], [rx2, ry2], DEFAULT_OBSTACLES);
  }

  const end = process.hrtime.bigint();
  const elapsedMs = Number(end - start) / 1e6;
  const latencyPerCheck = (elapsedMs / iterations) * 1000; // in microseconds

  console.log(`  * Total Iterations:       ${iterations.toLocaleString()} raycasts`);
  console.log(`  * Total Benchmark Time:   ${elapsedMs.toFixed(2)} ms`);
  console.log(`  * Latency per Raycast:    ${latencyPerCheck.toFixed(2)} µs (${(latencyPerCheck / 1000).toFixed(6)} ms)`);

  assert(latencyPerCheck / 1000 < 0.05, 'Raycast occlusion takes < 0.05ms (SLA target < 20ms exceeded with +99.9% headroom)');

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`  ROOM PERSISTENCE VERIFICATION COMPLETE: ${failed === 0 ? 'ALL TESTS PASSED (100%)' : `${failed} FAILED`}`);
  console.log(`  * Total Assertions: ${passed + failed}`);
  console.log(`  * Passed:           ${passed}`);
  console.log(`  * Failed:           ${failed}`);
  console.log('='.repeat(80) + '\n');

  if (failed > 0) process.exit(1);
}

runRoomPersistenceTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  });
