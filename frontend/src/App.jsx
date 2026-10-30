import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import ProximityRadarPreview from './components/ProximityRadarPreview';
import SessionDashboard from './components/SessionDashboard';
import VirtualOfficeWorld from './components/VirtualOfficeWorld';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import { Radio, ShieldCheck, MapPin, CheckCircle2, AlertCircle, Info, Sparkles, Compass } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('login'); // 'login' | 'signup' | 'dashboard' | 'world'
  const [currentUser, setCurrentUser] = useState(null);
  const [previewAvatarColor, setPreviewAvatarColor] = useState('#6366f1');
  const [previewName, setPreviewName] = useState('You');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'connected' | 'offline'
  const [toast, setToast] = useState(null);

  // Check backend health & socket connection
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
        // Default to the 2D Virtual Office Canvas World for logged in users
        setCurrentView('world');
      } catch (e) {
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
    // Take user directly into the 2D Virtual Office World!
    setCurrentView('world');
    showToast(`Welcome ${user.name}! Stepping into the 2D Virtual Office...`, 'success');
  };

  const handleSignupSuccess = (user, token) => {
    setCurrentUser(user);
    setCurrentView('world');
    showToast(`Welcome ${user.name}! Your avatar is now live on the 2D Canvas!`, 'success');
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

  // Guest avatar profile if entering world without logging in
  const guestUser = {
    id: 'guest_' + Math.random().toString(36).substring(2, 8),
    name: 'Guest Colleague',
    username: 'guest_avatar',
    role: 'Team Member',
    avatarColor: previewAvatarColor || '#06b6d4',
    location: [480, 320]
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
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto w-full">
        {currentView === 'world' ? (
          /* WEEK 1: 2D Virtual World (React & Canvas layer) with smooth keyboard/mouse movement */
          <VirtualOfficeWorld
            user={currentUser || guestUser}
            onBackToDashboard={() => setCurrentView(currentUser ? 'dashboard' : 'login')}
            showToast={showToast}
          />
        ) : currentView === 'dashboard' ? (
          <SessionDashboard
            user={currentUser}
            onLogout={handleLogout}
            onLaunchWorld={() => setCurrentView('world')}
          />
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
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-300">
                      <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
                      <span>Project 2 • Week 1 Live Deliverables</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentView('world')}
                      className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Enter Canvas World</span>
                      <Compass className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h3 className="text-sm font-bold text-white">
                    "ProxiSpeak": Geospatial Proximity Audio Ecosystem
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Week 1 brings the <strong className="text-slate-200">React Canvas layer</strong> and <strong className="text-slate-200">Node.js + Socket.io WebSocket server</strong> to life! Move avatars smoothly via keyboard or mouse with real-time X/Y coordinate broadcasting and MongoDB geospatial 2D indexing.
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
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
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
            <span className="text-[11px] text-slate-400 font-mono">
              Week 1: Socket.io & React Canvas
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
