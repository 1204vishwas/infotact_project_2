// Redis-backed realtime state shared by every Node instance.
//
// Each realtime layer keeps a small local cache for synchronous reads, but the
// authoritative roster lives in a Redis hash when Redis is configured. When
// Redis is unavailable the store transparently behaves like the original
// in-memory Map, so local development and the no-Redis demo keep working.

let defaultRedis = null;
const warned = new Set();

function warnOnce(action, err) {
  if (warned.has(action)) return;
  warned.add(action);
  console.warn(`[RealtimeStore] Redis ${action} failed; using local cache:`, (err && err.message) || err);
}

function setDefaultRedis(client) {
  defaultRedis = client || null;
}

function getRedis() {
  return defaultRedis && defaultRedis.status === 'ready' ? defaultRedis : null;
}

function isRedisEnabled() {
  return Boolean(getRedis());
}

function toTimestamp(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRecord(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function createRealtimeStore(namespace) {
  const prefix = `proxispeak:realtime:${namespace}`;
  const local = new Map();

  async function set(key, value) {
    local.set(key, value);
    const redis = getRedis();
    if (!redis) return;
    try {
      await redis.hset(prefix, key, JSON.stringify(value));
    } catch (err) {
      warnOnce('hset', err);
    }
  }

  async function get(key) {
    const redis = getRedis();
    if (!redis) return local.get(key) || null;
    try {
      const record = parseRecord(await redis.hget(prefix, key));
      if (record) {
        local.set(key, record);
        return record;
      }
      local.delete(key);
      return null;
    } catch (err) {
      warnOnce('hget', err);
      return local.get(key) || null;
    }
  }

  async function remove(key) {
    local.delete(key);
    const redis = getRedis();
    if (!redis) return;
    try {
      await redis.hdel(prefix, key);
    } catch (err) {
      warnOnce('hdel', err);
    }
  }

  async function values() {
    const redis = getRedis();
    if (!redis) return Array.from(local.values());
    try {
      const all = await redis.hgetall(prefix);
      const records = [];
      local.clear();
      for (const [key, raw] of Object.entries(all || {})) {
        const record = parseRecord(raw);
        if (!record) continue;
        local.set(key, record);
        records.push(record);
      }
      return records;
    } catch (err) {
      warnOnce('hgetall', err);
      return Array.from(local.values());
    }
  }

  async function size() {
    const redis = getRedis();
    if (!redis) return local.size;
    try {
      return await redis.hlen(prefix);
    } catch (err) {
      warnOnce('hlen', err);
      return local.size;
    }
  }

  async function find(predicate) {
    const records = await values();
    return records.find(predicate) || null;
  }

  // Refresh liveness without resurrecting a record another instance deleted.
  async function touch(keys) {
    const list = Array.from(new Set(keys || [])).filter(Boolean);
    if (list.length === 0) return;
    const now = Date.now();
    const redis = getRedis();

    if (!redis) {
      for (const key of list) {
        const record = local.get(key);
        if (record) record.updatedAt = now;
      }
      return;
    }

    try {
      const existing = await Promise.all(list.map((key) => redis.hexists(prefix, key)));
      const multi = redis.multi();
      let count = 0;
      list.forEach((key, index) => {
        if (!existing[index]) {
          local.delete(key);
          return;
        }
        const record = local.get(key);
        if (!record) return;
        record.updatedAt = now;
        local.set(key, record);
        multi.hset(prefix, key, JSON.stringify(record));
        count += 1;
      });
      if (count > 0) await multi.exec();
    } catch (err) {
      warnOnce('touch', err);
    }
  }

  async function cleanup(maxAgeMs) {
    if (!getRedis()) return;
    const now = Date.now();
    const records = await values();
    for (const record of records) {
      const last = toTimestamp(record.updatedAt || record.joinedAt);
      if (!last || now - last > maxAgeMs) {
        const key = record.socketId || record.id;
        if (key) await remove(key);
      }
    }
  }

  function startMaintenance({ heartbeatMs = 10000, cleanupMs = 15000, maxAgeMs = 30000, localKeys } = {}) {
    const heartbeat = setInterval(() => {
      const keys = typeof localKeys === 'function' ? localKeys() : localKeys;
      if (keys && keys.length > 0) touch(keys).catch(() => {});
    }, heartbeatMs);

    const sweeper = setInterval(() => {
      cleanup(maxAgeMs).catch(() => {});
    }, cleanupMs);

    if (heartbeat.unref) heartbeat.unref();
    if (sweeper.unref) sweeper.unref();

    return () => {
      clearInterval(heartbeat);
      clearInterval(sweeper);
    };
  }

  return {
    namespace,
    prefix,
    local,
    set,
    get,
    getLocal: (key) => local.get(key) || null,
    delete: remove,
    values,
    size,
    find,
    touch,
    cleanup,
    startMaintenance,
    isRedisEnabled
  };
}

module.exports = {
  createRealtimeStore,
  setDefaultRedis,
  getRedis,
  isRedisEnabled
};
