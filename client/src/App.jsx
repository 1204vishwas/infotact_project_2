import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ProximityRadarPreview from './components/ProximityRadarPreview';
import WorldCanvas from './components/WorldCanvas';
import ProfilePanel from './components/ProfilePanel';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import { CheckCircle2, AlertCircle, Info, Sparkles } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('login'); // 'login' | 'signup' | 'office' | 'profile'
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('proxispeak_theme') || 'light';
    } catch (e) {
      return 'light';
    }
  }); // 'light' | 'dark'
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null); // stable per-tab token captured at auth time
  const [savedSession, setSavedSession] = useState(null); // { user, token } detected but NOT auto-restored
  const [previewAvatarColor, setPreviewAvatarColor] = useState('#6366f1');
  const [previewName, setPreviewName] = useState('You');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'connected' | 'offline'
  const [socketStatus, setSocketStatus] = useState('idle'); // 'connecting' | 'connected' | 'offline' | 'idle'
  const [toast, setToast] = useState(null);

  // Check backend health
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          setBackendStatus('connected');
        } else {
          setBackendStatus('offline');
        }
      } catch (err) {
        setBackendStatus('offline');
      }
    };
    checkBackend();
  }, []);

  // Apply the selected theme to <html>: this switches the remapped slate
  // tokens in index.css and enables the `light:` utility variants.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('proxispeak_theme', theme);
    } catch (e) {
      /* storage unavailable — theme still applies for this session */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  // Detect a previously saved session WITHOUT auto-restoring it. Opening the
  // app always shows the login page; the stored identity is only resumed after
  // the user explicitly confirms AND the backend validates the JWT.
  useEffect(() => {
    const storedUser = sessionStorage.getItem('proxispeak_user') || localStorage.getItem('proxispeak_user');
    const storedToken = sessionStorage.getItem('proxispeak_token') || localStorage.getItem('proxispeak_token');

    if (storedUser && storedToken) {
      try {
        setSavedSession({ user: JSON.parse(storedUser), token: storedToken });
      } catch (e) {
        localStorage.removeItem('proxispeak_user');
        sessionStorage.removeItem('proxispeak_user');
        setSavedSession(null);
      }
    }
  }, []);

  const clearStoredSession = () => {
    localStorage.removeItem('proxispeak_token');
    localStorage.removeItem('proxispeak_user');
    sessionStorage.removeItem('proxispeak_token');
    sessionStorage.removeItem('proxispeak_user');
    setSavedSession(null);
  };

  const handleResumeSession = async () => {
    if (!savedSession) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedSession.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const freshUser = data.user || savedSession.user;
          sessionStorage.setItem('proxispeak_user', JSON.stringify(freshUser));
          sessionStorage.setItem('proxispeak_token', savedSession.token);
          setCurrentUser(freshUser);
          setSessionToken(savedSession.token);
          setSocketStatus('connecting');
          setCurrentView('office');
          showToast(`Session resumed for ${freshUser.name || 'you'}.`, 'success');
          return;
        }
      }
    } catch (err) {
      console.warn('Session validation unavailable:', err);
    }

    // Token invalid, expired, or backend unreachable — never inherit the session.
    clearStoredSession();
    showToast('Saved session could not be validated. Please log in again.', 'error');
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const enterOffice = (user, token) => {
    setCurrentUser(user);
    setSessionToken(token);
    setSocketStatus('connecting');
    setCurrentView('office');
  };

  const handleLoginSuccess = (user, token) => {
    sessionStorage.setItem('proxispeak_user', JSON.stringify(user));
    sessionStorage.setItem('proxispeak_token', token);
    enterOffice(user, token);
  };

  const handleSignupSuccess = (user, token) => {
    sessionStorage.setItem('proxispeak_user', JSON.stringify(user));
    sessionStorage.setItem('proxispeak_token', token);
    enterOffice(user, token);
  };

  const handleLogout = () => {
    clearStoredSession();
    setCurrentUser(null);
    setSessionToken(null);
    setSocketStatus('idle');
    setCurrentView('login');
    showToast('Signed out from ProxiSpeak workspace.', 'info');
  };

  const handleAvatarChange = (color, name) => {
    if (color) setPreviewAvatarColor(color);
    if (name) setPreviewName(name);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white isolate">
      {/* Ambient aurora backdrop behind every view */}
      <div aria-hidden="true" className="aurora-backdrop pointer-events-none fixed inset-0 -z-10" />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs font-medium animate-bounce">
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-cyan-400" />}
          <span className="text-slate-200">{toast.message}</span>
        </div>
      )}

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        showToast={showToast}
      />

      {/* Top Navigation */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        user={currentUser}
        backendStatus={backendStatus}
        socketStatus={socketStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-7xl mx-auto w-full">
        {currentView === 'office' ? (
          <WorldCanvas
            user={currentUser}
            token={sessionToken}
            showToast={showToast}
            onStatusChange={setSocketStatus}
            theme={theme}
          />
        ) : currentView === 'profile' ? (
          <ProfilePanel user={currentUser} onLogout={handleLogout} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Column: Auth Form (Sign Up or Login) */}
            <div className="lg:col-span-6 w-full order-2 lg:order-1">
              {currentView === 'login' ? (
                <LoginPage
                  onLoginSuccess={handleLoginSuccess}
                  onSwitchToSignup={() => setCurrentView('signup')}
                  onOpenForgotPassword={() => setIsForgotPasswordOpen(true)}
                  showToast={showToast}
                  restoredSession={savedSession}
                  onResumeSession={handleResumeSession}
                  onClearSession={clearStoredSession}
                />
              ) : (
                <SignUpPage
                  onSignupSuccess={handleSignupSuccess}
                  onSwitchToLogin={() => setCurrentView('login')}
                  onAvatarChange={handleAvatarChange}
                  showToast={showToast}
                />
              )}
            </div>

            {/* Right Column: ProxiSpeak Geospatial Proximity Visualizer Showcase */}
            <div className="lg:col-span-6 w-full order-1 lg:order-2 space-y-4">
              <div className="bg-gradient-to-r from-indigo-500/10 via-cyan-500/10 to-violet-500/10 p-1 rounded-2xl border border-indigo-500/20 mb-2">
                <div className="p-4 rounded-xl bg-slate-950/80">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-300 mb-1">
                    <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span>Project 2 Architecture • Live Technology Preview</span>
                  </div>
                  <h3 className="text-sm font-bold text-white light:text-gray-900">
                    "ProxiSpeak": Geospatial Proximity Audio Ecosystem
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Unlike rigid Zoom rooms, colleagues communicate by naturally walking over to peer clusters in a 2D overhead canvas. Distances are calculated in real time using the Socket.io world layer with Web Audio API 3D spatial pan.
                  </p>
                </div>
              </div>

              {/* The Interactive Radar Visualizer */}
              {ProximityRadarPreview && (
                <ProximityRadarPreview
                  previewAvatarColor={previewAvatarColor}
                  previewName={previewName}
                  theme={theme}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer conforming to Project 2 document metadata */}
      <footer className="border-t border-slate-900 light:border-gray-200 bg-slate-950/80 py-5 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="font-bold text-slate-400">INFOTACT SOLUTIONS</span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <span>Electronic City Bengaluru, Karnataka, PIN 560100</span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <span className="font-mono text-slate-400">support@infotact.in</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-medium">
              ISO 9001:2015 Certified
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-[11px] text-slate-400">
              ProxiSpeak v1.0.1
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}