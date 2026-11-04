/**
 * ProxiSpeak MySQL Database Manager & Connection Pool
 * Infotact Solutions — ISO 9001:2015 Quality Assurance
 * 
 * Manages connections to MySQL server on localhost:3306.
 * Features:
 * - Connection pooling via mysql2/promise
 * - Dynamic credentials testing & runtime reconfiguration
 * - Auto-initialization of relational tables (audit logs, user sessions, room snapshots)
 * - Non-blocking graceful fallback with detailed diagnostic reporting
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

class MySQLManager {
  constructor() {
    this.pool = null;
    this.status = {
      connected: false,
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      database: process.env.MYSQL_DATABASE || 'proxispeak',
      serverVersion: null,
      pingMs: null,
      error: null,
      lastChecked: null,
      tables: []
    };
  }

  /**
   * Get current connection configuration from env or defaults
   */
  getConfig(overrides = {}) {
    return {
      host: overrides.host || process.env.MYSQL_HOST || '127.0.0.1',
      port: parseInt(overrides.port || process.env.MYSQL_PORT || '3306', 10),
      user: overrides.user || process.env.MYSQL_USER || 'root',
      password: overrides.password !== undefined ? overrides.password : (process.env.MYSQL_PASSWORD || ''),
      database: overrides.database || process.env.MYSQL_DATABASE || 'proxispeak',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 5000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000
    };
  }

  /**
   * Test connection with specific credentials without affecting active pool
   */
  async testConnection(customConfig = {}) {
    const config = this.getConfig(customConfig);
    const start = process.hrtime.bigint();
    let conn = null;

    try {
      // First try connecting directly (with or without database specified)
      try {
        conn = await mysql.createConnection({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          connectTimeout: 5000
        });
      } catch (dbErr) {
        // If error is database unknown (ER_BAD_DB_ERROR), try connecting without database
        if (dbErr.code === 'ER_BAD_DB_ERROR') {
          conn = await mysql.createConnection({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            connectTimeout: 5000
          });
        } else {
          throw dbErr;
        }
      }

      const [rows] = await conn.query('SELECT VERSION() AS version, CURRENT_USER() AS user, DATABASE() AS cur_db');
      const end = process.hrtime.bigint();
      const pingMs = Number(end - start) / 1e6;

      let databases = [];
      try {
        const [dbRows] = await conn.query('SHOW DATABASES');
        databases = dbRows.map(r => Object.values(r)[0]);
      } catch (_) {}

      await conn.end();

      return {
        success: true,
        host: config.host,
        port: config.port,
        user: rows[0].user || config.user,
        serverVersion: rows[0].version,
        database: rows[0].cur_db || config.database,
        databases,
        pingMs: parseFloat(pingMs.toFixed(3)),
        message: `Successfully connected to MySQL ${rows[0].version} on ${config.host}:${config.port}`
      };
    } catch (err) {
      return {
        success: false,
        host: config.host,
        port: config.port,
        user: config.user,
        database: config.database,
        code: err.code || 'UNKNOWN',
        message: err.message,
        diagnostic: this.getDiagnosticHelp(err, config)
      };
    }
  }

  /**
   * Initialize or reconfigure MySQL connection pool
   */
  async init(customConfig = {}) {
    const config = this.getConfig(customConfig);

    // Close existing pool if open
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (_) {}
      this.pool = null;
    }

    this.status.host = config.host;
    this.status.port = config.port;
    this.status.user = config.user;
    this.status.database = config.database;
    this.status.lastChecked = new Date().toISOString();

    console.log(`[ProxiSpeak MySQL] Attempting connection to MySQL at ${config.host}:${config.port} (User: ${config.user}, Database: ${config.database})...`);

    // 1. First probe without database to ensure database existence or create it
    try {
      const rootConn = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        connectTimeout: 5000
      });

      // Query version
      const [verRows] = await rootConn.query('SELECT VERSION() AS version');
      this.status.serverVersion = verRows[0]?.version || '8.0';

      // Create database if not exists
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await rootConn.end();

      // 2. Create the connection pool targeting the database
      this.pool = mysql.createPool(config);

      // Verify pool with a ping query
      const pStart = process.hrtime.bigint();
      const [pRows] = await this.pool.query('SELECT 1 AS ping, DATABASE() AS active_db');
      const pEnd = process.hrtime.bigint();
      this.status.pingMs = parseFloat((Number(pEnd - pStart) / 1e6).toFixed(3));

      // 3. Initialize relational tables
      await this.initTables();

      this.status.connected = true;
      this.status.error = null;
      console.log(`[ProxiSpeak MySQL] ✓ Successfully connected to MySQL at ${config.host}:${config.port} (DB: ${config.database}, Ping: ${this.status.pingMs}ms)`);
      return true;
    } catch (err) {
      this.status.connected = false;
      this.status.error = {
        code: err.code || 'UNKNOWN',
        message: err.message,
        diagnostic: this.getDiagnosticHelp(err, config)
      };
      console.warn(`[ProxiSpeak MySQL] ⚠️ Connection notice: ${err.message}`);
      console.log(`[ProxiSpeak MySQL] Diagnostic hint: ${this.status.error.diagnostic}`);
      return false;
    }
  }

  /**
   * Create core relational tables for ProxiSpeak if they don't exist
   */
  async initTables() {
    if (!this.pool) return;

    try {
      // 1. Audit logs table (persists spatial engine audit and latency telemetry)
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS spatial_audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          test_name VARCHAR(100) NOT NULL,
          avg_latency_ms DECIMAL(8, 4) NOT NULL,
          p95_latency_ms DECIMAL(8, 4) NOT NULL,
          max_latency_ms DECIMAL(8, 4) NOT NULL,
          iterations INT NOT NULL,
          status VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // 2. User session audit table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_login_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(100) NOT NULL,
          email VARCHAR(150) NOT NULL,
          name VARCHAR(100),
          role VARCHAR(50),
          auth_provider VARCHAR(50) DEFAULT 'local',
          login_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // 3. Room layout persistence snapshots
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS room_layout_snapshots (
          id INT AUTO_INCREMENT PRIMARY KEY,
          room_id VARCHAR(100) NOT NULL,
          version INT DEFAULT 1,
          obstacle_count INT NOT NULL,
          soundproof_count INT NOT NULL,
          layout_json LONGTEXT NOT NULL,
          saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Fetch created tables
      const [tables] = await this.pool.query('SHOW TABLES');
      this.status.tables = tables.map(r => Object.values(r)[0]);
    } catch (err) {
      console.warn(`[ProxiSpeak MySQL] Table initialization warning: ${err.message}`);
    }
  }

  /**
   * Helper to execute SQL queries
   */
  async query(sql, params = []) {
    if (!this.pool) {
      throw new Error(`MySQL not connected (${this.status.error?.message || 'Pool inactive'})`);
    }
    return this.pool.query(sql, params);
  }

  /**
   * Update configuration and persist password to backend/.env if requested
   */
  async updateConfig(newConfig = {}, persistToEnv = false) {
    if (persistToEnv) {
      this.persistEnvSettings(newConfig);
    }
    return this.init(newConfig);
  }

  /**
   * Write updated MySQL settings to backend/.env
   */
  persistEnvSettings(settings = {}) {
    try {
      const envPath = path.resolve(__dirname, '..', '.env');
      let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

      const updateKey = (key, val) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
          content = content.replace(regex, `${key}=${val}`);
        } else {
          content += `\n${key}=${val}`;
        }
      };

      if (settings.host) updateKey('MYSQL_HOST', settings.host);
      if (settings.port) updateKey('MYSQL_PORT', settings.port);
      if (settings.user) updateKey('MYSQL_USER', settings.user);
      if (settings.password !== undefined) updateKey('MYSQL_PASSWORD', settings.password);
      if (settings.database) updateKey('MYSQL_DATABASE', settings.database);

      fs.writeFileSync(envPath, content.trim() + '\n', 'utf8');
      console.log(`[ProxiSpeak MySQL] Persisted updated configuration to ${envPath}`);
    } catch (err) {
      console.warn(`[ProxiSpeak MySQL] Failed to write .env: ${err.message}`);
    }
  }

  /**
   * Return descriptive diagnostic message based on MySQL error codes
   */
  getDiagnosticHelp(err, config) {
    if (err.code === 'ECONNREFUSED') {
      return `Cannot connect to MySQL on ${config.host}:${config.port}. Verify MySQL service (MySQL80) is started on your laptop.`;
    }
    if (err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === '1045') {
      return `Access denied for user '${config.user}'@'${config.host}'. Please configure your MySQL root password in backend/.env (MYSQL_PASSWORD=your_password).`;
    }
    if (err.code === 'ETIMEDOUT') {
      return `Connection timed out connecting to ${config.host}:${config.port}. Check firewall or network access.`;
    }
    if (err.code === 'ER_BAD_DB_ERROR') {
      return `Database '${config.database}' does not exist on MySQL server. It will be automatically created once authentication succeeds.`;
    }
    return err.message;
  }

  /**
   * Get current status report
   */
  getStatus() {
    return {
      ...this.status,
      lastChecked: this.status.lastChecked || new Date().toISOString()
    };
  }
}

// Singleton instance
const mysqlService = new MySQLManager();

module.exports = mysqlService;
