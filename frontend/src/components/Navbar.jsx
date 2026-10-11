import React from 'react';
import { Radio, ShieldCheck, Waves, Users, LayoutDashboard, Compass, LogOut } from 'lucide-react';

export default function Navbar({ currentView, setCurrentView, backendStatus, currentUser, onLogout }) {
  return (
    <header className="w-full border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentView(currentUser ? 'world' : 'login')}>
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/20">
            <Radio className="w-5 h-5 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                ProxiSpeak
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Week 1
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
              <span className="font-medium text-cyan-400">INFOTACT SOLUTIONS</span>
              <span>•</span>
              <span className="hidden sm:inline">Geospatial Audio Ecosystem</span>
            </div>
          </div>
        </div>

        {/* Center Badges (Certifications as seen in project sheet) */}
        <div className="hidden md:flex items-center space-x-3 text-xs text-slate-400">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px]">ISO 9001:2015</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <Waves className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px]">HTML5 Canvas 60 FPS</span>
          </div>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <Users className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px]">Socket.io Coordinates</span>
          </div>
        </div>

        {/* View Switcher / Status */}
        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-1 text-xs">
            <span className={`inline-block w-2 h-2 rounded-full ${backendStatus === 'connected' ? 'bg-emerald-500 shadow-sm shadow-emerald-500' : 'bg-amber-400'}`}></span>
            <span className="text-slate-400 text-[11px]">
              {backendStatus === 'connected' ? 'Signaling Online' : 'Local Engine'}
            </span>
          </div>

          {currentUser ? (
            <div className="flex items-center space-x-2">
              <div className="flex bg-slate-900/90 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setCurrentView('world')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                    currentView === 'world'
                      ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-sm shadow-indigo-500/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>2D Canvas World</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('dashboard')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                    currentView === 'dashboard'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Profile</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 cursor-pointer transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex bg-slate-900/90 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentView('login')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  currentView === 'login'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('signup')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  currentView === 'signup'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('world')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center space-x-1 ${
                  currentView === 'world'
                    ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-500/50'
                    : 'text-cyan-400 hover:text-cyan-200'
                }`}
              >
                <Compass className="w-3 h-3" />
                <span>Guest World</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
