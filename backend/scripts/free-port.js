#!/usr/bin/env node
/**
 * Frees the backend port before `npm run dev` / `npm start` boots the server.
 *
 * `node --watch` only restarts the child *it* spawned, so a leftover
 * `node server.js` from a previous terminal keeps holding the port and the
 * new run dies with EADDRINUSE. This script detects that stale listener and
 * kills it -- but only when it is a Node process running from this repo.
 * Anything else is reported instead of being killed.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const PORT = Number(process.env.PORT) || 5000;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    return (err.stdout || '').toString().trim();
  }
}

function listeners(port) {
  const out = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return out ? out.split(/\s+/).filter(Boolean) : [];
}

function isOurBackend(pid) {
  const command = run('ps', ['-o', 'command=', '-p', pid]);
  const cwdOut = run('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn']);
  const cwd = cwdOut
    .split('\n')
    .filter((line) => line.startsWith('n'))
    .map((line) => line.slice(1))[0] || '';

  const binary = path.basename((command.split(' ')[0] || '').toLowerCase());
  const isNode = binary === 'node' || binary === 'nodejs';
  const inRepo = cwd === REPO_ROOT || cwd.startsWith(REPO_ROOT + path.sep);

  return { ok: isNode && inRepo, command, cwd };
}

(async () => {
  const pids = listeners(PORT);

  if (pids.length === 0) {
    return;
  }

  for (const pid of pids) {
    const info = isOurBackend(pid);

    if (!info.ok) {
      console.error(`[free-port] Port ${PORT} is held by PID ${pid} (${info.command || 'unknown'}), which is not this project's backend.`);
      console.error(`[free-port] Refusing to kill it. Stop it manually: kill -9 ${pid}`);
      process.exit(1);
    }

    try {
      process.kill(Number(pid), 'SIGKILL');
      console.log(`[free-port] Killed stale backend (PID ${pid}) holding port ${PORT}.`);
    } catch (err) {
      console.error(`[free-port] Could not kill PID ${pid}: ${err.message}`);
      process.exit(1);
    }
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (listeners(PORT).length === 0) {
      console.log(`[free-port] Port ${PORT} released.`);
      return;
    }
    await sleep(100);
  }

  console.error(`[free-port] Port ${PORT} is still in use. Inspect with:`);
  console.error(`[free-port]   lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
  process.exit(1);
})();
