import React from 'react';
import {
  LogOut,
  MonitorPlay,
  Radio,
  ShieldCheck,
  Wifi,
  WifiOff,
  Compass,
  LayoutDashboard,
  UserRound
} from 'lucide-react';

export default function Navbar({ currentView, setCurrentView, user, backendStatus, socketStatus, onLogout }) {
  const isAuthed = Boolean(user);
  const signalingLive = socketStatus === 'connected';

  const navItem = (view, label, Icon) => (
    <button
      type="button"
      key={view}
      onClick={() => setCurrentView(view)}
      className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
        currentView === view
          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/50'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{label}</span>
    </button>
  );

  return (
    <header className="w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Brand / Logo */}
        <div
          className="flex items-center space-x-3 min-w-0 cursor-pointer"
          onClick={() => setCurrentView(isAuthed ? 'world' : 'login')}
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20 shrink-0">
            <Radio className="w-5 h-5 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                ProxiSpeak
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                WEEK 1
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
              <span className="font-medium text-cyan-400">INFOTACT SOLUTIONS</span>
              <span>•</span>
              <span className="hidden sm:inline">Geospatial Proximity Audio</span>
            </div>
          </div>
        </div>

        {/* Status Badges */}
        <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-400">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px]">ISO 9001:2015</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <MonitorPlay className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px]">HTML5 Canvas 60 FPS</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <Radio className={`w-3.5 h-3.5 ${signalingLive ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="text-[11px]">Socket.IO Coordinates</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            {signalingLive ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span className={`text-[11px] ${signalingLive ? 'text-emerald-300' : 'text-slate-400'}`}>
              Signaling {signalingLive ? 'Online' : 'Idle'}
            </span>
          </div>
        </div>

        {/* Right: view switcher / auth */}
        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-1 text-xs">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                backendStatus === 'connected' ? 'bg-emerald-500 shadow-sm shadow-emerald-500' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-400 text-[11px]">
              {backendStatus === 'connected' ? 'API Online' : 'Local Engine'}
            </span>
          </div>

          <div className="flex bg-slate-900/90 p-1 rounded-lg border border-slate-800">
            {isAuthed ? (
              <>
                {navItem('world', '2D World', Compass)}
                {navItem('office', 'Canvas', MonitorPlay)}
                {navItem('dashboard', 'Dashboard', LayoutDashboard)}
                {navItem('profile', 'Profile', UserRound)}
              </>
            ) : (
              <>
                {navItem('login', 'Log In')}
                {navItem('signup', 'Sign Up')}
                {navItem('world', 'Guest World', Compass)}
              </>
            )}
          </div>

          {isAuthed && (
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-slate-300 rounded-lg transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
