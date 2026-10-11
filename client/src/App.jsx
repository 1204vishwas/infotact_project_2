import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ProximityRadarPreview from './components/ProximityRadarPreview';
import SessionDashboard from './components/SessionDashboard';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import { Radio, ShieldCheck, MapPin, CheckCircle2, AlertCircle, Info, Sparkles } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('login'); // 'login' | 'signup' | 'dashboard'
  const [currentUser, setCurrentUser] = useState(null);
  const [previewAvatarColor, setPreviewAvatarColor] = useState('#6366f1');
  const [previewName, setPreviewName] = useState('You');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'connected' | 'offline'
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

  // Check stored user session
  useEffect(() => {
    const storedUser = localStorage.getItem('proxispeak_user') || sessionStorage.getItem('proxispeak_user');
    const storedToken = localStorage.getItem('proxispeak_token') || sessionStorage.getItem('proxispeak_token');

    if (storedUser && storedToken) {
      try {
        const parsed = JSON.parse(storedUser);
        setCurrentUser(parsed);
        setCurrentView('dashboard');
      } catch (e) {
        // Clear corrupt storage
        localStorage.removeItem('proxispeak_user');
        sessionStorage.removeItem('proxispeak_user');
      }
    }
  }, []);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const handleLoginSuccess = (user, token) => {
    setCurrentUser(user);
    setCurrentView('dashboard');
  };

  const handleSignupSuccess = (user, token) => {
    setCurrentUser(user);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('proxispeak_token');
    localStorage.removeItem('proxispeak_user');
    sessionStorage.removeItem('proxispeak_token');
    sessionStorage.removeItem('proxispeak_user');
    setCurrentUser(null);
    setCurrentView('login');
    showToast('Signed out from ProxiSpeak workspace.', 'info');
  };

  const handleAvatarChange = (color, name) => {
    if (color) setPreviewAvatarColor(color);
    if (name) setPreviewName(name);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-indigo-500 selection:text-white">
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
        backendStatus={backendStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-7xl mx-auto w-full">
        {currentView === 'dashboard' ? (
          <SessionDashboard user={currentUser} onLogout={handleLogout} showToast={showToast} />
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
                  <h3 className="text-sm font-bold text-white">
                    "ProxiSpeak": Geospatial Proximity Audio Ecosystem
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Unlike rigid Zoom rooms, colleagues communicate by naturally walking over to peer clusters in a 2D overhead canvas. Distances are calculated in real time using MongoDB geospatial <code className="text-cyan-400 font-mono">$near</code> & <code className="text-cyan-400 font-mono">$geoWithin</code> queries with Web Audio API 3D spatial pan.
                  </p>
                </div>
              </div>

              {/* The Interactive Radar Visualizer */}
              <ProximityRadarPreview
                previewAvatarColor={previewAvatarColor}
                previewName={previewName}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer conforming to Project 2 document metadata */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-5 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
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
              ProxiSpeak v1.0
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
