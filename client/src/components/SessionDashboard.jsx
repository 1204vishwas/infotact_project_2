import React, { useMemo } from 'react';
import { LogOut, Radio, Navigation, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import WorldCanvas from './WorldCanvas';

export default function SessionDashboard({ user, onLogout, showToast }) {
  const token = useMemo(
    () => localStorage.getItem('proxispeak_token') || sessionStorage.getItem('proxispeak_token'),
    []
  );

  const coords = user?.location?.coordinates || (Array.isArray(user?.location) ? user.location : [600, 360]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Identity bar */}
      <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
              <div className="flex items-center space-x-2 flex-wrap">
                <h2 className="text-xl font-extrabold text-white">{user?.name}</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {user?.role || 'Team Member'}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                  <Navigation className="w-3 h-3 text-cyan-400" />
                  {coords[0]}, {coords[1]}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                @{user?.username || 'user'} • {user?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-800/50">
              <ShieldCheck className="w-3.5 h-3.5" />
              JWT Session Valid
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <div className="relative mt-4 p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center space-x-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-[11px] text-slate-300">
            Welcome to the Infotact virtual office. Use <span className="text-cyan-300 font-mono">WASD</span> / arrow keys or click the floor to walk your avatar. Coordinates broadcast live to peers within a {150}px earshot.
          </p>
        </div>
      </div>

      {/* The React Canvas World */}
      <WorldCanvas user={user} token={token} showToast={showToast} />

      {/* Roadmap note */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950/20 to-slate-950 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Next: WebRTC Audio Mesh over the Earshot Graph
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            The canvas world and coordinate broadcasting are live. Peer connections within earshot now drive the Web Audio API 3D spatial pan.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-mono text-indigo-300 bg-indigo-950/50 px-2.5 py-1 rounded-md border border-indigo-800/50 whitespace-nowrap">
          <Radio className="w-3.5 h-3.5" />
          Socket.io World Layer Active
        </span>
      </div>
    </div>
  );
}
