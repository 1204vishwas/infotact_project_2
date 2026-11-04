import React, { useState } from 'react';
import {
  X,
  Building2,
  Save,
  Plus,
  Trash2,
  VolumeX,
  Volume2,
  Shield,
  Layers,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Database,
  Sliders,
  Sparkles,
  Info
} from 'lucide-react';

const PRESETS = [
  {
    label: 'Acoustic Soundproof Wall',
    type: 'acoustic-wall',
    width: 24,
    height: 220,
    color: '#312e81',
    blocksSound: true,
    soundReduction: 1.0,
    soundReductionDb: 45
  },
  {
    label: 'Sound Isolation Booth',
    type: 'sound-booth',
    width: 140,
    height: 90,
    color: '#064e3b',
    blocksSound: true,
    soundReduction: 1.0,
    soundReductionDb: 50
  },
  {
    label: 'Soundproof Glass Partition',
    type: 'glass-partition',
    width: 24,
    height: 220,
    color: '#0369a1',
    blocksSound: true,
    soundReduction: 1.0,
    soundReductionDb: 40
  },
  {
    label: 'Open Collaboration Dev Desk',
    type: 'desk',
    width: 140,
    height: 60,
    color: '#1e293b',
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0
  },
  {
    label: 'Breakout Lounge Coffee Table',
    type: 'table',
    width: 160,
    height: 70,
    color: '#1e293b',
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0
  },
  {
    label: 'Audio DSP Mixing Board',
    type: 'console',
    width: 150,
    height: 60,
    color: '#1e293b',
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0
  }
];

export default function RoomLayoutModal({
  isOpen,
  onClose,
  obstacles,
  onUpdateObstacles,
  onSaveToMongo,
  onResetLayout,
  roomSource,
  isSaving,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('obstacles'); // 'obstacles' | 'add' | 'raycast'
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);

  // New obstacle form state
  const [newObs, setNewObs] = useState({
    label: PRESETS[0].label,
    type: PRESETS[0].type,
    x: 450,
    y: 280,
    width: PRESETS[0].width,
    height: PRESETS[0].height,
    color: PRESETS[0].color,
    blocksSound: PRESETS[0].blocksSound
  });

  // Sound raycast test points
  const [testRay, setTestRay] = useState({
    fromX: 420,
    fromY: 150,
    toX: 520,
    toY: 150
  });
  const [rayResult, setRayResult] = useState(null);
  const [isVerifyingRay, setIsVerifyingRay] = useState(false);

  if (!isOpen) return null;

  const soundBlockingCount = obstacles.filter((o) => o.blocksSound).length;
  const openCount = obstacles.length - soundBlockingCount;

  // Handle preset selection
  const handleSelectPreset = (idx) => {
    setSelectedPresetIndex(idx);
    const p = PRESETS[idx];
    setNewObs((prev) => ({
      ...prev,
      label: p.label,
      type: p.type,
      width: p.width,
      height: p.height,
      color: p.color,
      blocksSound: p.blocksSound
    }));
  };

  // Toggle blocksSound on existing obstacle
  const handleToggleSound = (id) => {
    const updated = obstacles.map((obs) => {
      if (obs.id === id) {
        const nextBlocks = !obs.blocksSound;
        return {
          ...obs,
          blocksSound: nextBlocks,
          color: nextBlocks ? (obs.color === '#1e293b' ? '#312e81' : obs.color) : (obs.color === '#312e81' ? '#1e293b' : obs.color)
        };
      }
      return obs;
    });
    onUpdateObstacles(updated);
    const changed = updated.find((o) => o.id === id);
    showToast(`'${changed.label}': Blocks Sound is now ${changed.blocksSound ? 'ENABLED (Mutes Audio)' : 'DISABLED (Sound Permitted)'}`, 'info');
  };

  // Delete obstacle
  const handleDelete = (id) => {
    const updated = obstacles.filter((o) => o.id !== id);
    onUpdateObstacles(updated);
    showToast('Obstacle removed from room layout.', 'info');
  };

  // Add new obstacle
  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newObs.label.trim()) {
      showToast('Please enter an obstacle label.', 'error');
      return;
    }

    const created = {
      id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      label: newObs.label.trim(),
      type: newObs.type,
      x: parseInt(newObs.x, 10) || 400,
      y: parseInt(newObs.y, 10) || 300,
      width: parseInt(newObs.width, 10) || 100,
      height: parseInt(newObs.height, 10) || 50,
      color: newObs.color || (newObs.blocksSound ? '#312e81' : '#1e293b'),
      blocksSound: Boolean(newObs.blocksSound),
      soundReduction: newObs.blocksSound ? 1.0 : 0.0,
      soundReductionDb: newObs.blocksSound ? 45 : 0
    };

    onUpdateObstacles([...obstacles, created]);
    showToast(`Added '${created.label}' (${created.blocksSound ? 'Blocks Sound' : 'Open Furniture'}). Click 'Save to MongoDB' to persist!`, 'success');

    // Reset to preset
    handleSelectPreset(selectedPresetIndex);
    setActiveTab('obstacles');
  };

  // Run backend audio raycast check
  const handleTestAudioRay = async () => {
    setIsVerifyingRay(true);
    try {
      const res = await fetch('/api/spatial/verify-audio-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromCoords: [parseInt(testRay.fromX, 10), parseInt(testRay.fromY, 10)],
          toCoords: [parseInt(testRay.toX, 10), parseInt(testRay.toY, 10)],
          maxRadius: 100
        })
      });
      const data = await res.json();
      setRayResult(data);
    } catch (e) {
      showToast('Failed to verify audio path.', 'error');
    } finally {
      setIsVerifyingRay(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Room Persistence & Sound-Blocking Obstacles
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Database className="w-2.5 h-2.5" />
                  MongoDB ({roomSource || 'connected'})
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                Save office layouts and furniture obstacles (which block sound) into MongoDB
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 sm:p-4 bg-slate-950/40 border-b border-slate-800/80 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Furniture</span>
            <span className="text-base font-extrabold text-white mt-0.5 block">{obstacles.length} Obstacles</span>
            <span className="text-[10px] text-slate-500 font-mono">960 × 640 World</span>
          </div>

          <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30">
            <span className="text-[10px] text-indigo-300 uppercase tracking-wider block flex items-center gap-1">
              <VolumeX className="w-3 h-3 text-indigo-400" />
              Blocks Sound
            </span>
            <span className="text-base font-extrabold text-indigo-200 mt-0.5 block">
              {soundBlockingCount} Soundproof
            </span>
            <span className="text-[10px] text-indigo-400/80 font-mono">Occludes WebRTC Audio</span>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
            <span className="text-[10px] text-emerald-300 uppercase tracking-wider block flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-emerald-400" />
              Sound Permitted
            </span>
            <span className="text-base font-extrabold text-emerald-200 mt-0.5 block">
              {openCount} Open Items
            </span>
            <span className="text-[10px] text-emerald-400/80 font-mono">Transparent to Audio</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Persistence Target</span>
            <span className="text-base font-extrabold text-cyan-300 mt-0.5 block truncate">MongoDB Atlas</span>
            <span className="text-[10px] text-cyan-400/80 font-mono truncate block">Collection: officespaces</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-4 bg-slate-950/20">
          <button
            type="button"
            onClick={() => setActiveTab('obstacles')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-all flex items-center space-x-1.5 ${
              activeTab === 'obstacles'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Furniture Obstacles ({obstacles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('add')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-all flex items-center space-x-1.5 ${
              activeTab === 'add'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Furniture / Sound Barrier</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('raycast')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-all flex items-center space-x-1.5 ${
              activeTab === 'raycast'
                ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Acoustic Raycast Test</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: Obstacles List with Sound Blocking Toggle */}
          {activeTab === 'obstacles' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <span>Manage individual office obstacles. Click the sound toggle to change acoustic blockage:</span>
                <span className="font-mono text-[11px] text-cyan-300">
                  {soundBlockingCount} of {obstacles.length} block audio
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {obstacles.map((obs) => (
                  <div
                    key={obs.id}
                    className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      obs.blocksSound
                        ? 'bg-indigo-950/30 border-indigo-500/40 shadow-sm shadow-indigo-950'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Obstacle info */}
                    <div className="flex items-start space-x-3">
                      <div
                        className="w-4 h-10 rounded-lg shrink-0 mt-0.5 border"
                        style={{
                          backgroundColor: obs.color || (obs.blocksSound ? '#312e81' : '#1e293b'),
                          borderColor: obs.blocksSound ? '#818cf8' : '#334155'
                        }}
                      />
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs sm:text-sm font-bold text-white">{obs.label}</span>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                              obs.blocksSound
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {obs.type || 'desk'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono mt-0.5">
                          <span>X: {obs.x}, Y: {obs.y}</span>
                          <span>•</span>
                          <span>{obs.width} × {obs.height} px</span>
                          {obs.blocksSound && (
                            <>
                              <span>•</span>
                              <span className="text-indigo-400 font-bold">-45 dB Sound Loss</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Sound Toggle & Delete */}
                    <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleToggleSound(obs.id)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer transition-all ${
                          obs.blocksSound
                            ? 'bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border-rose-500/50 shadow-sm'
                            : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
                        }`}
                        title="Toggle sound blocking behavior"
                      >
                        {obs.blocksSound ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                            <span>Blocks Sound (Muted)</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Sound Permitted</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(obs.id)}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer"
                        title="Delete obstacle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Add New Furniture Obstacle */}
          {activeTab === 'add' && (
            <form onSubmit={handleAddSubmit} className="space-y-4">
              {/* Presets Grid */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Select Architectural Preset:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESETS.map((p, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => handleSelectPreset(idx)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        selectedPresetIndex === idx
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold block truncate">{p.label}</span>
                        {p.blocksSound ? (
                          <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {p.width} × {p.height} px • {p.blocksSound ? 'Soundproof' : 'Open'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Obstacle Label
                  </label>
                  <input
                    type="text"
                    value={newObs.label}
                    onChange={(e) => setNewObs({ ...newObs, label: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Acoustic Soundproof Partition"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Obstacle Category / Type
                  </label>
                  <select
                    value={newObs.type}
                    onChange={(e) => setNewObs({ ...newObs, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="acoustic-wall">Acoustic Partition Wall</option>
                    <option value="sound-booth">Sound Isolation Booth</option>
                    <option value="glass-partition">Soundproof Glass Divider</option>
                    <option value="desk">Developer Desk</option>
                    <option value="table">Conference Table</option>
                    <option value="console">Audio Console</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Coordinates [X, Y]
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={newObs.x}
                      onChange={(e) => setNewObs({ ...newObs, x: parseInt(e.target.value, 10) || 0 })}
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                      placeholder="X (0-960)"
                    />
                    <input
                      type="number"
                      value={newObs.y}
                      onChange={(e) => setNewObs({ ...newObs, y: parseInt(e.target.value, 10) || 0 })}
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                      placeholder="Y (0-640)"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Dimensions [Width × Height]
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={newObs.width}
                      onChange={(e) => setNewObs({ ...newObs, width: parseInt(e.target.value, 10) || 0 })}
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                      placeholder="Width"
                    />
                    <input
                      type="number"
                      value={newObs.height}
                      onChange={(e) => setNewObs({ ...newObs, height: parseInt(e.target.value, 10) || 0 })}
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs"
                      placeholder="Height"
                    />
                  </div>
                </div>
              </div>

              {/* Sound Blocking Switch */}
              <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-xl ${newObs.blocksSound ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                    {newObs.blocksSound ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Sound-Blocking Barrier (blocksSound)
                    </span>
                    <span className="text-[11px] text-slate-300 block">
                      {newObs.blocksSound
                        ? 'Audio raycasts cannot pass through this obstacle. WebRTC audio between avatars will be muted.'
                        : 'Sound waves pass through cleanly (regular desk or open meeting table).'}
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={newObs.blocksSound}
                    onChange={(e) => setNewObs({ ...newObs, blocksSound: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center space-x-2 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Obstacle to Virtual Office</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Acoustic Raycast Test */}
          {activeTab === 'raycast' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 flex items-start space-x-2.5">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  Test 2D raycasting line-of-sight sound occlusion. The server tests whether a straight line between two avatars intersects any obstacle with <strong className="text-cyan-300 font-mono">blocksSound: true</strong>.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="font-bold text-white block">Speaker Coordinates [X1, Y1]:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={testRay.fromX}
                      onChange={(e) => setTestRay({ ...testRay, fromX: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                      placeholder="X1"
                    />
                    <input
                      type="number"
                      value={testRay.fromY}
                      onChange={(e) => setTestRay({ ...testRay, fromY: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                      placeholder="Y1"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">e.g. [420, 150] in Audio Lab</span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="font-bold text-white block">Listener Coordinates [X2, Y2]:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={testRay.toX}
                      onChange={(e) => setTestRay({ ...testRay, toX: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                      placeholder="X2"
                    />
                    <input
                      type="number"
                      value={testRay.toY}
                      onChange={(e) => setTestRay({ ...testRay, toY: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                      placeholder="Y2"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">e.g. [520, 150] in WebRTC Bay</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setTestRay({ fromX: 420, fromY: 150, toX: 520, toY: 150 })}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
                  >
                    Preset: Through Soundproof Wall
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestRay({ fromX: 420, fromY: 320, toX: 520, toY: 320 })}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
                  >
                    Preset: Open Concourse
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleTestAudioRay}
                  disabled={isVerifyingRay}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold cursor-pointer transition-colors"
                >
                  {isVerifyingRay ? 'Verifying...' : 'Execute Raycast Test'}
                </button>
              </div>

              {/* Raycast Result Card */}
              {rayResult && (
                <div
                  className={`p-4 rounded-2xl border text-xs space-y-2 animate-fadeIn ${
                    rayResult.isSoundBlocked
                      ? 'bg-rose-950/40 border-rose-500/50'
                      : 'bg-emerald-950/40 border-emerald-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm flex items-center space-x-1.5">
                      {rayResult.isSoundBlocked ? (
                        <>
                          <VolumeX className="w-4 h-4 text-rose-400" />
                          <span className="text-rose-300">SOUND OCCLUDED / BLOCKED</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-300">CLEAR LINE-OF-SIGHT PATH</span>
                        </>
                      )}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                      Status: {rayResult.status}
                    </span>
                  </div>

                  <p className="text-slate-300 text-[11px]">
                    {rayResult.blockReason}
                  </p>

                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[10px] text-slate-400">
                    <div>Distance: <strong className="text-white">{rayResult.distance}px</strong></div>
                    <div>Base Gain: <strong className="text-white">{rayResult.baseGain}%</strong></div>
                    <div>Effective Gain: <strong className={rayResult.isSoundBlocked ? 'text-rose-400' : 'text-emerald-400'}>{rayResult.effectiveGain}%</strong></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <button
              type="button"
              onClick={onResetLayout}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
              title="Reset office layout & obstacles to factory defaults in MongoDB"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>

            <button
              type="button"
              onClick={onSaveToMongo}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 border border-emerald-400/40 text-white text-xs font-bold flex items-center space-x-2 shadow-lg shadow-emerald-600/30 cursor-pointer transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-emerald-200" />
              <span>{isSaving ? 'Saving to MongoDB...' : 'Save Layout to MongoDB'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
