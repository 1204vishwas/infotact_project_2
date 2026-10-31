#!/usr/bin/env node

/**
 * ProxiSpeak Full-Stack Development Runner
 * Infotact Solutions — ISO 9001:2015 Quality Assurance
 * 
 * Automates:
 * 1. Pre-flight Automated Verification Suite (Spatial Audit & Two-Browser WebRTC Audio Check)
 * 2. Concurrent startup of Backend (Express + Socket.io @ :5000) and Frontend (Vite + React @ :3000)
 * 3. Graceful process management and clean port release on shutdown
 */

const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const skipVerify = process.argv.includes('--skip-verify');

// Terminal colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  white: '\x1b[37m'
};

function logBanner() {
  console.log(`\n${colors.bold}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`  ${colors.bold}${colors.white}PROXISPEAK: GEOSPATIAL PROXIMITY AUDIO ECOSYSTEM${colors.reset}`);
  console.log(`  ${colors.dim}Infotact Solutions | Electronic City Bengaluru | ISO 9001:2015 QA Certified${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}================================================================================${colors.reset}\n`);
}

function runVerificationSuite() {
  if (skipVerify) {
    console.log(`${colors.yellow}⚠️  [VERIFY] --skip-verify flag detected. Skipping pre-flight test suite.${colors.reset}\n`);
    return true;
  }

  console.log(`${colors.bold}${colors.blue}▶ PHASE 1: RUNNING AUTOMATED VERIFICATION SUITE${colors.reset}`);
  console.log(`${colors.dim}  Testing Spatial Engine latency (<20ms SLA) & Two-Browser WebRTC Audio Gatekeeper...${colors.reset}\n`);

  try {
    // 1. Spatial Audit Benchmark
    console.log(`${colors.cyan}[1/2] Executing Spatial Engine Audit & Latency Benchmark...${colors.reset}`);
    execSync('node scripts/audit-benchmark.js', {
      cwd: BACKEND_DIR,
      stdio: 'inherit'
    });

    // 2. Dual-Browser WebRTC Audio Check Simulation
    console.log(`\n${colors.magenta}[2/2] Executing Dual-Browser WebRTC Audio Check Simulation...${colors.reset}`);
    execSync('node scripts/audio-check-demo.js', {
      cwd: BACKEND_DIR,
      stdio: 'inherit'
    });

    console.log(`\n${colors.bold}${colors.green}✓ All Automated Verification Checks PASSED with 100% Compliance!${colors.reset}\n`);
    return true;
  } catch (err) {
    console.error(`\n${colors.bold}${colors.red}❌ Automated Verification Failed: ${err.message}${colors.reset}\n`);
    return false;
  }
}

function launchServices() {
  console.log(`${colors.bold}${colors.blue}▶ PHASE 2: LAUNCHING FULL-STACK SERVICES${colors.reset}`);
  console.log(`  ${colors.green}● Backend Server:${colors.reset}  ${colors.bold}http://localhost:5000${colors.reset} (Express & Socket.io Signaling)`);
  console.log(`  ${colors.magenta}● Frontend Client:${colors.reset} ${colors.bold}http://localhost:3000${colors.reset} (React 19 & HTML5 Canvas 2D World)`);
  console.log(`${colors.dim}  Press Ctrl+C at any time to gracefully terminate both services.${colors.reset}\n`);
  console.log(`${colors.cyan}--------------------------------------------------------------------------------${colors.reset}\n`);

  const children = [];

  // 1. Start Backend Server
  const backendProc = spawn(npmCmd, ['run', 'start'], {
    cwd: BACKEND_DIR,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
    env: { ...process.env, FORCE_COLOR: '1' }
  });
  children.push({ name: 'BACKEND', proc: backendProc, color: colors.green });

  backendProc.stdout.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    lines.forEach((line) => {
      if (line.trim()) {
        console.log(`${colors.green}[BACKEND]${colors.reset} ${line}`);
      }
    });
  });

  backendProc.stderr.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    lines.forEach((line) => {
      if (line.trim()) {
        console.error(`${colors.yellow}[BACKEND:ERR]${colors.reset} ${line}`);
      }
    });
  });

  // 2. Start Frontend Vite Dev Server
  const frontendProc = spawn(npmCmd, ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
    env: { ...process.env, FORCE_COLOR: '1' }
  });
  children.push({ name: 'FRONTEND', proc: frontendProc, color: colors.magenta });

  frontendProc.stdout.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    lines.forEach((line) => {
      if (line.trim()) {
        console.log(`${colors.magenta}[FRONTEND]${colors.reset} ${line}`);
      }
    });
  });

  frontendProc.stderr.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    lines.forEach((line) => {
      if (line.trim()) {
        console.error(`${colors.yellow}[FRONTEND:ERR]${colors.reset} ${line}`);
      }
    });
  });

  // Shutdown handler
  let isShuttingDown = false;
  function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n\n${colors.bold}${colors.yellow}Shutting down ProxiSpeak services...${colors.reset}`);

    children.forEach(({ name, proc }) => {
      try {
        if (isWindows && proc.pid) {
          // Force process tree kill on Windows so ports 5000 and 3000 are freed instantly
          try {
            execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
          } catch (e) {
            proc.kill();
          }
        } else {
          proc.kill('SIGTERM');
        }
        console.log(`${colors.dim}  Stopped ${name} process (PID ${proc.pid})${colors.reset}`);
      } catch (e) {
        // Process might have already exited
      }
    });

    console.log(`${colors.green}✓ All services stopped cleanly. Goodbye!${colors.reset}\n`);
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', shutdown);

  backendProc.on('close', (code) => {
    if (!isShuttingDown && code !== 0) {
      console.error(`${colors.red}[BACKEND] Process exited with code ${code}${colors.reset}`);
    }
  });

  frontendProc.on('close', (code) => {
    if (!isShuttingDown && code !== 0) {
      console.error(`${colors.red}[FRONTEND] Process exited with code ${code}${colors.reset}`);
    }
  });
}

// Execution
logBanner();
const verified = runVerificationSuite();
if (verified) {
  launchServices();
} else {
  process.exit(1);
}
