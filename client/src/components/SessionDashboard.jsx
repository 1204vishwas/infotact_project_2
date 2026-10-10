import React from 'react';
import { LogOut, User, Radio, MapPin, Volume2, Mic, MicOff, Shield, Sparkles, Navigation, Layers, CheckCircle2 } from 'lucide-react';

export default function SessionDashboard({ user, onLogout }) {
  const [micActive, setMicActive] = React.useState(true);

  const coords = user?.location?.coordinates || [240, 200];

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-xl ring-2 ring-white/20"
                style={{ backgroundColor: user?.avatarColor || '#6366f1' }}
              >
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-extrabold text-white">{user?.name}</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {user?.role || 'Team Member'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                @{user?.username || 'user'} • {user?.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out Session</span>
          </button>
        </div>

        {/* Status banner */}
        <div className="my-6 p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-emerald-300">
                Authentication Successful & Spatial Coordinates Assigned
              </p>
              <p className="text-[11px] text-slate-400">
                You have successfully authenticated into the Infotact ProxiSpeak Geospatial Audio Ecosystem.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-block text-[11px] font-mono text-emerald-400 bg-emerald-900/50 px-2.5 py-1 rounded-md border border-emerald-700/50">
            JWT Session: Valid
          </span>
        </div>

        {/* Grid of Spatial Audio Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Card 1: Coordinates */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-cyan-400" />
                Office Coordinates
              </span>
              <span className="text-[10px] text-slate-500 font-mono">2dsphere</span>
            </div>
            <div className="text-lg font-mono font-bold text-white">
              X: {coords[0]}, Y: {coords[1]}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Ready for MongoDB $near proximity query
            </p>
          </div>

          {/* Card 2: Audio Earshot */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                Earshot Threshold
              </span>
              <span className="text-[10px] text-indigo-400 font-mono">100-150px</span>
            </div>
            <div className="text-lg font-mono font-bold text-white">
              Dynamic Gain 100%
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Web Audio API stereo panning crossfader
            </p>
          </div>

          {/* Card 3: Mic & Signaling */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-400" />
                Signaling Status
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">WebRTC P2P</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Audio Stream</span>
              <button
                type="button"
                onClick={() => setMicActive(!micActive)}
                className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                  micActive
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400'
                    : 'bg-rose-950/60 border-rose-500/50 text-rose-400'
                }`}
              >
                {micActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              {micActive ? 'Microphone transmitting on earshot' : 'Microphone muted'}
            </p>
          </div>
        </div>

        {/* Project 2 Roadmap preview */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950/20 to-slate-950 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Week 1 & 2 Roadmap: Canvas World & WebRTC Audio Mesh
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Auth module complete. The React Canvas 2D layer and Socket.io peer handshake integrate directly with this user profile.
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30 whitespace-nowrap cursor-pointer transition-colors"
          >
            Switch / Test Another User
          </button>
        </div>
      </div>
    </div>
  );
}
