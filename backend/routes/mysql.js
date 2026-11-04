/**
 * ProxiSpeak MySQL Management & Inspection Routes
 * Infotact Solutions — ISO 9001:2015 Quality Assurance
 * 
 * Endpoints:
 * - GET  /api/mysql/status           -> Connection status, ping, database, tables
 * - POST /api/mysql/test-connection  -> Test credentials (host, port, user, password, db)
 * - POST /api/mysql/update-config    -> Update connection pool credentials at runtime
 * - GET  /api/mysql/tables           -> List tables and row counts in active database
 * - GET  /api/mysql/databases        -> List available databases on MySQL server
 * - POST /api/mysql/query            -> Execute safe inspection SQL queries
 */

const express = require('express');
const router = express.Router();
const mysqlService = require('../config/mysql');

/**
 * GET /api/mysql/status
 * Get current MySQL connection status and metrics
 */
router.get('/status', async (req, res) => {
  try {
    const status = mysqlService.getStatus();
    return res.json({
      success: true,
      data: status
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/mysql/test-connection
 * Probe MySQL with provided credentials
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { host, port, user, password, database } = req.body;
    const testResult = await mysqlService.testConnection({
      host,
      port,
      user,
      password,
      database
    });

    return res.json(testResult);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/mysql/update-config
 * Reconfigure MySQL connection pool and optionally persist to backend/.env
 */
router.post('/update-config', async (req, res) => {
  try {
    const { host, port, user, password, database, persist = true } = req.body;

    const connected = await mysqlService.updateConfig(
      { host, port, user, password, database },
      persist
    );

    const status = mysqlService.getStatus();

    return res.json({
      success: connected,
      status,
      message: connected
        ? `Successfully connected to MySQL at ${status.host}:${status.port} (Database: ${status.database})`
        : `Connection failed: ${status.error?.message || 'Check credentials'}`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/mysql/tables
 * List tables and row counts
 */
router.get('/tables', async (req, res) => {
  try {
    if (!mysqlService.pool) {
      return res.status(503).json({
        success: false,
        error: 'MySQL pool is not connected',
        status: mysqlService.getStatus()
      });
    }

    const [tableRows] = await mysqlService.query('SHOW TABLES');
    const tableNames = tableRows.map(r => Object.values(r)[0]);

    const tablesWithCounts = [];
    for (const name of tableNames) {
      try {
        const [countRow] = await mysqlService.query(`SELECT COUNT(*) AS total FROM \`${name}\``);
        tablesWithCounts.push({
          name,
          rowCount: countRow[0]?.total || 0
        });
      } catch (_) {
        tablesWithCounts.push({ name, rowCount: null });
      }
    }

    return res.json({
      success: true,
      database: mysqlService.status.database,
      tables: tablesWithCounts
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/mysql/databases
 * List all databases on MySQL server
 */
router.get('/databases', async (req, res) => {
  try {
    if (!mysqlService.pool) {
      return res.status(503).json({
        success: false,
        error: 'MySQL pool is not connected',
        status: mysqlService.getStatus()
      });
    }

    const [dbRows] = await mysqlService.query('SHOW DATABASES');
    const databases = dbRows.map(r => Object.values(r)[0]);

    return res.json({
      success: true,
      databases
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/mysql/query
 * Execute safe inspection SQL queries (SELECT, SHOW, DESCRIBE)
 */
router.post('/query', async (req, res) => {
  try {
    const { sql, params = [] } = req.body;

    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ success: false, error: 'SQL query string is required' });
    }

    const trimmed = sql.trim().toUpperCase();
    const isSafe = trimmed.startsWith('SELECT') || trimmed.startsWith('SHOW') || trimmed.startsWith('DESCRIBE') || trimmed.startsWith('EXPLAIN');

    if (!isSafe) {
      return res.status(403).json({
        success: false,
        error: 'Only read-only queries (SELECT, SHOW, DESCRIBE) are allowed via this endpoint.'
      });
    }

    const start = process.hrtime.bigint();
    const [rows, fields] = await mysqlService.query(sql, params);
    const end = process.hrtime.bigint();

    return res.json({
      success: true,
      durationMs: parseFloat((Number(end - start) / 1e6).toFixed(3)),
      rowCount: rows.length,
      columns: fields?.map(f => f.name) || [],
      rows
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
