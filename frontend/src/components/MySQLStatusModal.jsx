import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Key,
  Server,
  Zap,
  Table,
  Play,
  Eye,
  EyeOff,
  HelpCircle,
  Layers,
  Activity
} from 'lucide-react';

export default function MySQLStatusModal({ isOpen, onClose }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [tables, setTables] = useState([]);
  const [databases, setDatabases] = useState([]);
  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'tables' | 'query'
  const [notification, setNotification] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'proxispeak'
  });

  // Query state
  const [sqlQuery, setSqlQuery] = useState('SHOW TABLES');
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);

  // Fetch status on modal open
  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const showToast = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mysql/status');
      const data = await res.json();
      if (data.success && data.data) {
        setStatus(data.data);
        setFormData(prev => ({
          ...prev,
          host: data.data.host || '127.0.0.1',
          port: data.data.port || 3306,
          user: data.data.user || 'root',
          database: data.data.database || 'proxispeak'
        }));

        if (data.data.connected) {
          fetchTables();
          fetchDatabases();
        }
      }
    } catch (err) {
      console.warn('Failed to fetch MySQL status:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await fetch('/api/mysql/tables');
      const data = await res.json();
      if (data.success && data.tables) {
        setTables(data.tables);
      }
    } catch (_) {}
  };

  const fetchDatabases = async () => {
    try {
      const res = await fetch('/api/mysql/databases');
      const data = await res.json();
      if (data.success && data.databases) {
        setDatabases(data.databases);
      }
    } catch (_) {}
  };

  const handleTestConnection = async (e) => {
    e?.preventDefault();
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/mysql/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      setTestResult(data);

      if (data.success) {
        showToast(`✓ Connection Verified: MySQL ${data.serverVersion} on port ${data.port}`, 'success');
      } else {
        showToast(`⚠️ ${data.message || 'Connection failed'}`, 'error');
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message,
        diagnostic: 'Network error communicating with ProxiSpeak backend'
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveAndConnect = async (e) => {
    e?.preventDefault();
    setSaveLoading(true);

    try {
      const res = await fetch('/api/mysql/update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, persist: true })
      });
      const data = await res.json();

      if (data.success) {
        setStatus(data.status);
        showToast('✓ MySQL Connected & Settings Saved to backend/.env!', 'success');
        fetchTables();
        fetchDatabases();
      } else {
        showToast(`⚠️ Failed to connect: ${data.message}`, 'error');
        if (data.status) setStatus(data.status);
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRunQuery = async () => {
    if (!sqlQuery.trim()) return;
    setQueryLoading(true);
    setQueryResult(null);

    try {
      const res = await fetch('/api/mysql/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlQuery })
      });
      const data = await res.json();
      setQueryResult(data);
    } catch (err) {
      setQueryResult({ success: false, error: err.message });
    } finally {
      setQueryLoading(false);
    }
  };

  if (!isOpen) return null;

  const isConnected = status?.connected === true;
  const isAuthPending = !isConnected && (status?.error?.code === 'ER_ACCESS_DENIED_ERROR' || status?.error?.code === '1045');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden text-slate-100 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 text-cyan-400">
              <Database className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">MySQL Database Manager</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  localhost:3306
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Infotact Solutions • Relational Audit Telemetry & Session Persistence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-800/80 rounded-lg transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Status Bar */}
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">Status:</span>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                ONLINE (Connected)
              </span>
            ) : isAuthPending ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                PORT 3306 ACTIVE • PASSWORD NEEDED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium bg-red-500/10 text-red-400 border border-red-500/30">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                STANDBY / OFFLINE
              </span>
            )}

            <div className="h-4 w-px bg-slate-800" />

            <span className="text-slate-400">Host:</span>
            <span className="font-mono text-cyan-300">{status?.host || '127.0.0.1'}:{status?.port || 3306}</span>

            {status?.serverVersion && (
              <>
                <div className="h-4 w-px bg-slate-800" />
                <span className="text-slate-400">Version:</span>
                <span className="font-mono text-slate-200">MySQL {status.serverVersion}</span>
              </>
            )}

            {status?.pingMs !== null && (
              <>
                <div className="h-4 w-px bg-slate-800" />
                <span className="text-slate-400">Ping:</span>
                <span className="font-mono text-emerald-400">{status.pingMs} ms</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Target DB:</span>
            <span className="px-2 py-0.5 rounded font-mono bg-cyan-950/40 text-cyan-300 border border-cyan-800/40">
              {status?.database || 'proxispeak'}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex px-6 pt-3 bg-slate-900 border-b border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
              activeTab === 'config'
                ? 'bg-slate-800 text-cyan-400 border-t-2 border-cyan-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Connection & Credentials
          </button>
          <button
            onClick={() => setActiveTab('tables')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
              activeTab === 'tables'
                ? 'bg-slate-800 text-cyan-400 border-t-2 border-cyan-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            Tables & Schema ({tables.length})
          </button>
          <button
            onClick={() => setActiveTab('query')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
              activeTab === 'query'
                ? 'bg-slate-800 text-cyan-400 border-t-2 border-cyan-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            SQL Query Console
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">

          {/* Toast Alert */}
          {notification && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-3 text-xs font-medium animate-fadeIn ${
                notification.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : notification.type === 'error'
                  ? 'bg-red-950/40 border-red-500/40 text-red-300'
                  : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
              }`}
            >
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
              )}
              <span>{notification.message}</span>
            </div>
          )}

          {/* TAB 1: CONFIGURATION & CREDENTIALS */}
          {activeTab === 'config' && (
            <div className="space-y-6">
              {/* Informative Guidance Card */}
              {isAuthPending && (
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-300">
                    <Key className="w-4 h-4" />
                    MySQL Server Detected on Port 3306 (Authentication Needed)
                  </div>
                  <p className="text-amber-200/90 leading-relaxed">
                    MySQL Server 8.0 is running on your laptop at <code>localhost:3306</code>. Enter your MySQL root password below and click <strong>"Test Connection"</strong> or <strong>"Save & Connect"</strong>. The credentials will automatically be saved to <code>backend/.env</code> and the connection pool will initialize.
                  </p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSaveAndConnect} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-cyan-400" />
                    Host / IP Address
                  </label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    placeholder="127.0.0.1"
                  />
                  <p className="text-[11px] text-slate-500">Default: 127.0.0.1 (Laptop Localhost)</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    Port
                  </label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value, 10) || 3306 })}
                    className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    placeholder="3306"
                  />
                  <p className="text-[11px] text-slate-500">Default: 3306</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.user}
                    onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    placeholder="root"
                  />
                  <p className="text-[11px] text-slate-500">Default: root</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-cyan-400" />
                      Password
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-cyan-400 text-[11px] flex items-center gap-1"
                    >
                      {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Enter your MySQL password..."
                  />
                  <p className="text-[11px] text-slate-500">Leave blank if no password is configured</p>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-cyan-400" />
                    Target Database
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.database}
                      onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                      className="flex-1 px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                      placeholder="proxispeak"
                    />
                    {databases.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) setFormData({ ...formData, database: e.target.value });
                        }}
                        className="px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none"
                      >
                        <option value="">Select Existing...</option>
                        {databases.map((db) => (
                          <option key={db} value={db}>
                            {db}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    If this database does not exist, ProxiSpeak will automatically create it upon connection.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800 md:col-span-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testLoading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    <Activity className={`w-4 h-4 ${testLoading ? 'animate-spin' : ''}`} />
                    {testLoading ? 'Probing Port 3306...' : 'Test Connection'}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ host: '127.0.0.1', port: 3306, user: 'root', password: '', database: 'proxispeak' })}
                      className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Reset Defaults
                    </button>
                    <button
                      type="submit"
                      disabled={saveLoading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all disabled:opacity-50"
                    >
                      <Database className={`w-4 h-4 ${saveLoading ? 'animate-spin' : ''}`} />
                      {saveLoading ? 'Connecting...' : 'Save & Connect to MySQL'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Probe / Test Diagnostic Result Box */}
              {testResult && (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-2 animate-fadeIn ${
                    testResult.success
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                      : 'bg-red-950/20 border-red-500/40 text-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      {testResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                      {testResult.success ? 'Connection Succeeded!' : 'Connection Probe Result'}
                    </div>
                    {testResult.pingMs !== undefined && (
                      <span className="font-mono text-emerald-400 text-[11px]">
                        Latency: {testResult.pingMs} ms
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300 font-mono text-[11px]">{testResult.message}</p>
                  {testResult.diagnostic && (
                    <p className="p-2 rounded bg-slate-950/60 text-slate-400 text-[11px] leading-relaxed">
                      💡 <strong>Hint:</strong> {testResult.diagnostic}
                    </p>
                  )}
                  {testResult.databases && testResult.databases.length > 0 && (
                    <div className="pt-2 border-t border-emerald-500/20">
                      <span className="text-slate-400">Databases on server: </span>
                      <span className="font-mono text-cyan-300">{testResult.databases.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TABLES & SCHEMA */}
          {activeTab === 'tables' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Relational Tables in MySQL</h3>
                  <p className="text-xs text-slate-400">
                    Database: <span className="font-mono text-cyan-400">{status?.database || 'proxispeak'}</span>
                  </p>
                </div>
                <button
                  onClick={fetchTables}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh Tables
                </button>
              </div>

              {tables.length === 0 ? (
                <div className="p-8 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl space-y-2">
                  <Table className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs">No tables found or MySQL not yet authenticated.</p>
                  <p className="text-[11px] text-slate-500">
                    Connect via the Connection tab to auto-generate ProxiSpeak relational tables.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tables.map((t) => (
                    <div
                      key={t.name}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-cyan-500/40 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-cyan-950/50 text-cyan-400">
                          <Table className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-mono font-semibold text-white">{t.name}</div>
                          <div className="text-[11px] text-slate-400">InnoDB • utf8mb4</div>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 text-xs font-mono rounded bg-slate-800 text-cyan-300">
                        {t.rowCount !== null ? `${t.rowCount} rows` : 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SQL QUERY CONSOLE */}
          {activeTab === 'query' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
                  Execute Safe Read-Only SQL Query
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    placeholder="e.g. SHOW TABLES or SELECT * FROM spatial_audit_logs LIMIT 10"
                    className="flex-1 px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleRunQuery}
                    disabled={queryLoading || !isConnected}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {queryLoading ? 'Running...' : 'Run Query'}
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <span className="text-[11px] text-slate-500">Quick queries:</span>
                  {['SHOW TABLES', 'SHOW DATABASES', 'SELECT * FROM spatial_audit_logs LIMIT 5'].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSqlQuery(q)}
                      className="text-[11px] font-mono text-cyan-400 hover:underline"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {queryResult && (
                <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                    <span>
                      {queryResult.success ? (
                        <span className="text-emerald-400 font-semibold">✓ Query OK ({queryResult.rowCount} rows)</span>
                      ) : (
                        <span className="text-red-400 font-semibold">⚠️ Query Error: {queryResult.error}</span>
                      )}
                    </span>
                    {queryResult.durationMs && (
                      <span className="font-mono text-slate-400">{queryResult.durationMs} ms</span>
                    )}
                  </div>

                  {queryResult.success && queryResult.rows?.length > 0 && (
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-900 text-cyan-400 sticky top-0">
                          <tr>
                            {queryResult.columns.map((col) => (
                              <th key={col} className="px-3 py-2 border-b border-slate-800">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {queryResult.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/40">
                              {queryResult.columns.map((col) => (
                                <td key={col} className="px-3 py-1.5 text-slate-300 whitespace-nowrap">
                                  {String(row[col] ?? 'NULL')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-950/90 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Port 3306 Configuration synced with <code>backend/.env</code></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
