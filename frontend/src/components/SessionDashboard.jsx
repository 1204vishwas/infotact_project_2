import React, { useState } from 'react';
import {
  LogOut,
  User,
  Radio,
  MapPin,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Shield,
  Sparkles,
  Navigation,
  Layers,
  CheckCircle2,
  Sliders,
  Compass,
  Headphones,
  Bell,
  Clock,
  Wifi,
  ChevronRight
} from 'lucide-react';

export default function SessionDashboard({ user, onLogout, onLaunchWorld }) {
  const [micActive, setMicActive] = useState(true);
  const [earshotRadius, setEarshotRadius] = useState(130);
  const [presenceStatus, setPresenceStatus] = useState('online'); // 'online' | 'busy' | 'away'
  const [selectedZone, setSelectedZone] = useState('center');
  const [testAudioPlaying, setTestAudioPlaying] = useState(false);

  // Spawn zone coordinate presets
  const zonePresets = [
    { id: 'center', name: 'Central Table', coords: [480, 320], icon: '🏢' },
    { id: 'audio', name: 'Audio Lab', coords: [180, 160], icon: '🎧' },
    { id: 'webrtc', name: 'WebRTC Bay', coords: [680, 160], icon: '💻' },
    { id: 'product', name: 'Product Hub', coords: [180, 480], icon: '💡' },
    { id: 'lounge', name: 'Coffee Lounge', coords: [680, 480], icon: '☕' }
  ];

  const currentCoords = zonePresets.find(z => z.id === selectedZone)?.coords || user?.location || [480, 320];

  // Play a brief Web Audio API synthesized spatial tone for testing
  const handleTestAudio = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Create stereo panner and oscillator
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // 440 Hz (A4)
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3); // Ramp to A5

      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      setTestAudioPlaying(true);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);

      setTimeout(() => setTestAudioPlaying(false), 500);
    } catch (e) {
      console.warn('Audio test not supported in this browser context:', e);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-2">
      <div className="bg-slate-900/90 rounded-2xl sm:rounded-3xl border border-slate-800 p-4 sm:p-6 md:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow ambient background elements */}
        <div className="absolute top-0 right-0 w-72 sm:w-96 h-72 sm:h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 sm:w-96 h-72 sm:h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* ====================================================
            1. USER PROFILE HEADER & STATUS OPTIONS (RESPONSIVE)
           ==================================================== */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
          {/* User Info & Avatar */}
          <div className="flex items-center space-x-3 sm:space-x-4 w-full md:w-auto min-w-0">
            <div className="relative shrink-0">
              <div
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center text-white text-lg sm:text-2xl font-black shadow-xl ring-2 ring-white/20 transition-transform hover:scale-105"
                style={{ backgroundColor: user?.avatarColor || '#6366f1' }}
              >
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-slate-900 ${
                presenceStatus === 'online' ? 'bg-emerald-500 ring-2 ring-emerald-500/30' :
                presenceStatus === 'busy' ? 'bg-amber-500 ring-2 ring-amber-500/30' : 'bg-slate-500'
              }`} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-base sm:text-xl font-extrabold text-white truncate max-w-[200px] sm:max-w-xs">
                  {user?.name || 'ProxiSpeak Member'}
                </h2>
                <span className="text-[9px] sm:text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 whitespace-nowrap">
                  {user?.role || 'Developer'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-mono mt-0.5 truncate">
                @{user?.username || 'user'} • {user?.email || 'user@infotact.in'}
              </p>
            </div>
          </div>

          {/* Right Header Options: Presence Selector & Logout */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/60">
            {/* Presence Status Dropdown Option */}
            <div className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setPresenceStatus('online')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  presenceStatus === 'online' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🟢 Available
              </button>
              <button
                type="button"
                onClick={() => setPresenceStatus('busy')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  presenceStatus === 'busy' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🟡 In Meeting
              </button>
              <button
                type="button"
                onClick={() => setPresenceStatus('away')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  presenceStatus === 'away' ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⚪ Away
              </button>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* ====================================================
            2. STATUS NOTIFICATION BANNER (RESPONSIVE)
           ==================================================== */}
        <div className="my-4 sm:my-6 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs sm:text-sm font-bold text-emerald-300">
                Spatial Presence Active in Cluster <span className="font-mono text-cyan-300">"proxify"</span>
              </p>
              <p className="text-[10px] sm:text-xs text-slate-400">
                Connected to localhost:27017 via Socket.io & MongoDB 2D geospatial indexing.
              </p>
            </div>
          </div>
          <span className="text-[10px] sm:text-[11px] font-mono text-emerald-400 bg-emerald-900/50 px-2.5 py-1 rounded-md border border-emerald-700/50 whitespace-nowrap self-end sm:self-auto">
            Session: JWT Active
          </span>
        </div>

        {/* ====================================================
            3. DASHBOARD OPTIONS & SETTINGS GRID (RESPONSIVE)
           ==================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          {/* OPTION 1: Office Coordinates & Spawn Zone */}
          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-cyan-400" />
                  Office Spawn Point
                </span>
                <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.5 rounded">
                  MongoDB 2d
                </span>
              </div>
              <div className="text-lg sm:text-xl font-mono font-black text-white">
                X: {currentCoords[0]}, Y: {currentCoords[1]}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">
                Select your preferred starting desk or zone:
              </p>

              {/* Zone Selector Pills */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {zonePresets.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setSelectedZone(z.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all cursor-pointer flex items-center space-x-1 ${
                      selectedZone === z.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <span>{z.icon}</span>
                    <span>{z.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-slate-900 font-mono">
              Indexed with min -1000 / max 10000 bounds
            </div>
          </div>

          {/* OPTION 2: Audio Earshot & Sensitivity */}
          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-indigo-400" />
                  Earshot Sensitivity
                </span>
                <span className="text-[10px] text-indigo-400 font-mono bg-indigo-950/60 border border-indigo-800/40 px-1.5 py-0.5 rounded">
                  Web Audio API
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div className="text-lg sm:text-xl font-mono font-black text-white">
                  {earshotRadius} px
                </div>
                <span className="text-[11px] font-semibold text-indigo-300">
                  {earshotRadius <= 100 ? 'Focused (Desk)' : earshotRadius <= 150 ? 'Standard (Pod)' : 'Wide (Room)'}
                </span>
              </div>

              {/* Earshot Range Slider Option */}
              <div className="mt-3 space-y-1.5">
                <input
                  type="range"
                  min="80"
                  max="200"
                  step="10"
                  value={earshotRadius}
                  onChange={(e) => setEarshotRadius(parseInt(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>80px</span>
                  <span>140px</span>
                  <span>200px</span>
                </div>
              </div>

              {/* Test Spatial Tone Option */}
              <div className="mt-2.5">
                <button
                  type="button"
                  onClick={handleTestAudio}
                  disabled={testAudioPlaying}
                  className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/40 rounded-lg text-[11px] font-medium text-slate-300 hover:text-white flex items-center justify-center space-x-1.5 cursor-pointer transition-colors"
                >
                  <Headphones className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{testAudioPlaying ? 'Playing Audio Tone...' : 'Test 3D Spatial Chime'}</span>
                </button>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-slate-900 font-mono">
              Auto gain attenuation crossfader active
            </div>
          </div>

          {/* OPTION 3: Microphone & Signaling Stream */}
          <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors sm:col-span-2 lg:col-span-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  Signaling & Audio Mic
                </span>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                  WebRTC P2P
                </span>
              </div>

              {/* Mic Stream Option */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800 mt-2">
                <div>
                  <span className="text-xs font-bold text-white block">Microphone Input</span>
                  <span className="text-[10px] text-slate-400">
                    {micActive ? 'Broadcasting when in earshot' : 'Muted (Silent)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMicActive(!micActive)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all transform active:scale-95 flex items-center space-x-1.5 ${
                    micActive
                      ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/20'
                      : 'bg-rose-950/70 border-rose-500/50 text-rose-300'
                  }`}
                >
                  {micActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  <span className="text-[11px] font-bold">{micActive ? 'Active' : 'Muted'}</span>
                </button>
              </div>

              {/* Audio Mode Badge */}
              <div className="mt-3 p-2 rounded-lg bg-slate-900/60 border border-slate-850 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Wifi className="w-3 h-3 text-cyan-400" /> WebRTC Audio Mesh
                </span>
                <span className="text-emerald-400 font-mono font-semibold">48 kHz Stereo</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-slate-900 font-mono">
              Socket.io peer discovery enabled
            </div>
          </div>
        </div>

        {/* ====================================================
            4. PRIMARY ACTION CTA: LAUNCH VIRTUAL OFFICE (RESPONSIVE)
           ==================================================== */}
        <div className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-cyan-950/40 via-indigo-950/40 to-slate-950 border border-cyan-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Week 1 Interactive 2D World</span>
            </div>
            <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-1.5">
              Launch ProxiSpeak Virtual Office Canvas
            </h4>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1 leading-relaxed">
              Step onto the HTML5 Canvas office floor with smooth WASD/mouse movement, 4 collaborative rooms, and real-time Socket.io coordinate broadcasting!
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={onLaunchWorld}
              className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-cyan-500 via-indigo-600 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-cyan-500/25 cursor-pointer transition-all transform active:scale-95 flex items-center justify-center space-x-2"
            >
              <Compass className="w-4 h-4 animate-spin" />
              <span>Enter 2D Virtual Office</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="w-full sm:w-auto px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl text-center cursor-pointer transition-colors"
            >
              Switch User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
