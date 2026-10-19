import React from 'react';
import { LogOut, Mic, MicOff, Navigation, Radio, ShieldCheck, Volume2 } from 'lucide-react';

export default function ProfilePanel({ user, onLogout }) {
  const coords = user?.location?.coordinates || (Array.isArray(user?.location) ? user.location : [600, 360]);
  const [micActive, setMicActive] = React.useState(true);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Identity */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-xl ring-2 ring-white/20"
                style={{ backgroundColor: user?.avatarColor || '#6366f1' }}
              >
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full" />
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

        {/* Session status */}
        <div className="my-6 p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
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

        {/* Profile cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-cyan-400" />
                Office Coordinates
              </span>
              <span className="text-[10px] text-slate-500 font-mono">2d index</span>
            </div>
            <div className="text-lg font-mono font-bold text-white">
              X: {coords[0]}, Y: {coords[1]}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Broadcast live over Socket.io from the 2D Canvas World
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                Earshot Threshold
              </span>
              <span className="text-[10px] text-indigo-400 font-mono">100-150px</span>
            </div>
            <div className="text-lg font-mono font-bold text-white">Dynamic Gain 100%</div>
            <p className="text-[10px] text-slate-500 mt-2">
              Proximity crossfade within the office world
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-400" />
                Signaling Status
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Socket.io</span>
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
      </div>
    </div>
  );
}