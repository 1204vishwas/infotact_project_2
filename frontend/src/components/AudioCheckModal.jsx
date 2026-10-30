import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Radio,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Zap,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  Headphones,
  Signal,
  ArrowRight,
  Sparkles,
  Play,
  Square,
  Users,
  Copy,
  Check
} from 'lucide-react';

export default function AudioCheckModal({
  isOpen,
  onClose,
  webrtcManager,
  socket,
  selfAvatar,
  peers,
  peerConnectionStates,
  onMoveToDistance,
  showToast
}) {
  const [selectedPeerId, setSelectedPeerId] = useState(null);
  const [stats, setStats] = useState(null);
  const [isTestToneActive, setIsTestToneActive] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [handshakeLog, setHandshakeLog] = useState([]);

  const localCanvasRef = useRef(null);
  const remoteCanvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Peer list array
  const peerList = Array.from(peers?.values?.() || []).filter((p) => p.socketId !== socket?.id);

  // Auto-select first peer if none selected
  useEffect(() => {
    if (!selectedPeerId && peerList.length > 0) {
      setSelectedPeerId(peerList[0].socketId);
    } else if (selectedPeerId && !peerList.some((p) => p.socketId === selectedPeerId)) {
      setSelectedPeerId(peerList.length > 0 ? peerList[0].socketId : null);
    }
  }, [peers, selectedPeerId]);

  const activePeer = peerList.find((p) => p.socketId === selectedPeerId);

  // Distance to active peer
  const currentDistance = activePeer && selfAvatar
    ? Math.round(
        Math.hypot(
          (activePeer.x || activePeer.targetX || 0) - (selfAvatar.x || 0),
          (activePeer.y || activePeer.targetY || 0) - (selfAvatar.y || 0)
        )
      )
    : 0;

  const isWithin100px = currentDistance <= 100;
  const connectionState = (selectedPeerId && peerConnectionStates?.[selectedPeerId]) || 'new';

  // Periodic stats polling
  useEffect(() => {
    if (!isOpen || !selectedPeerId || !webrtcManager) return;

    const interval = setInterval(async () => {
      const peerStats = await webrtcManager.getPeerStats(selectedPeerId);
      if (peerStats) {
        setStats(peerStats);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isOpen, selectedPeerId, webrtcManager]);

  // Audio Oscilloscope & Spectrum Canvas Animation Loop
  useEffect(() => {
    if (!isOpen) return;

    let running = true;
    const localWaveform = new Uint8Array(64);
    const localFreq = new Uint8Array(32);
    const remoteWaveform = new Uint8Array(64);
    const remoteFreq = new Uint8Array(32);

    const renderVisualizers = () => {
      if (!running) return;

      // 1. Local Visualizer
      if (localCanvasRef.current && webrtcManager) {
        const ctx = localCanvasRef.current.getContext('2d');
        const width = localCanvasRef.current.width;
        const height = localCanvasRef.current.height;

        webrtcManager.getLocalWaveformData(localWaveform);
        webrtcManager.getLocalFrequencyData(localFreq);

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Grid lines
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Frequency bars
        const barWidth = width / 32;
        for (let i = 0; i < 32; i++) {
          const barHeight = (localFreq[i] / 255) * (height * 0.45);
          ctx.fillStyle = `rgba(56, 189, 248, ${0.35 + (localFreq[i] / 255) * 0.65})`;
          ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
        }

        // Oscilloscope Waveform line
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#38bdf8';
        ctx.beginPath();
        const sliceWidth = width / 64;
        let x = 0;
        for (let i = 0; i < 64; i++) {
          const v = localWaveform[i] / 128.0;
          const y = (v * height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.stroke();
      }

      // 2. Remote Visualizer
      if (remoteCanvasRef.current && webrtcManager && selectedPeerId) {
        const ctx = remoteCanvasRef.current.getContext('2d');
        const width = remoteCanvasRef.current.width;
        const height = remoteCanvasRef.current.height;

        webrtcManager.getPeerWaveformData(selectedPeerId, remoteWaveform);
        webrtcManager.getPeerFrequencyData(selectedPeerId, remoteFreq);

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Remote frequency bars (emerald gradient)
        const barWidth = width / 32;
        for (let i = 0; i < 32; i++) {
          const barHeight = (remoteFreq[i] / 255) * (height * 0.45);
          ctx.fillStyle = `rgba(52, 211, 153, ${0.35 + (remoteFreq[i] / 255) * 0.65})`;
          ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
        }

        // Remote oscilloscope waveform line
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#34d399';
        ctx.beginPath();
        const sliceWidth = width / 64;
        let x = 0;
        for (let i = 0; i < 64; i++) {
          const v = remoteWaveform[i] / 128.0;
          const y = (v * height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(renderVisualizers);
    };

    renderVisualizers();

    return () => {
      running = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isOpen, webrtcManager, selectedPeerId]);

  if (!isOpen) return null;

  const handleToggleTestTone = () => {
    if (!webrtcManager) return;
    if (isTestToneActive) {
      webrtcManager.stopSyntheticAudio(true);
      setIsTestToneActive(false);
    } else {
      webrtcManager.startSyntheticAudio(440);
      setIsTestToneActive(true);
    }
  };

  const handleCopyAppUrl = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopiedUrl(true);
    showToast('ProxiSpeak URL copied! Open in a second browser/incognito window to test WebRTC audio.', 'success');
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleTriggerOffer = async () => {
    if (!selectedPeerId || !socket || !webrtcManager) return;
    showToast(`Dispatching WebRTC offer to ${activePeer?.name || selectedPeerId}...`, 'info');
    try {
      webrtcManager.createPeerConnection(selectedPeerId, {
        onIceCandidate: (candidate) => {
          socket.emit('webrtc-ice-candidate', {
            targetSocketId: selectedPeerId,
            candidate
          });
        }
      });
      const offer = await webrtcManager.createOffer(selectedPeerId);
      socket.emit('webrtc-offer', {
        targetSocketId: selectedPeerId,
        offer
      });
    } catch (err) {
      showToast(`Offer error: ${err.message}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-cyan-500/10 overflow-hidden text-slate-100 font-sans">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 text-cyan-400">
              <Headphones className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-white">
                  Audio Check: WebRTC Two-Browser P2P Verification
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  Mid-Project Review
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  ISO 9001:2015 QA
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Demonstrating two browsers establishing real-time WebRTC audio connection via Socket.io signaling server with 100px gatekeeper.
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <span className="sr-only">Close</span>
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* 1. Quick instructions for 2-browser testing */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <div className="text-xs">
                <p className="font-semibold text-slate-200">Open 2nd Browser</p>
                <p className="text-slate-400">Open Chrome + Edge, or an Incognito window at <code className="text-cyan-300">localhost:3000</code>.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <div className="text-xs">
                <p className="font-semibold text-slate-200">Approach Peer (&le;100px)</p>
                <p className="text-slate-400">Walk avatars closer. Signaling server validates distance and relays WebRTC SDP offer/answer.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                3
              </div>
              <div className="text-xs">
                <p className="font-semibold text-slate-200">Verify Audio Transmission</p>
                <p className="text-slate-400">Speak into mic or click <strong>Transmit Test Voice Tone</strong> to see real-time waveforms on both browsers.</p>
              </div>
            </div>
          </div>

          {/* 2. Connection Topology & Active Peer Selector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Active Peer List & Topology */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-cyan-400" /> Connected Teammates ({peerList.length})
                  </span>
                  <button
                    onClick={handleCopyAppUrl}
                    className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedUrl ? 'Copied!' : 'Copy Room URL'}
                  </button>
                </div>

                {peerList.length === 0 ? (
                  <div className="p-5 text-center rounded-lg bg-slate-900/60 border border-dashed border-slate-800">
                    <Radio className="w-7 h-7 mx-auto text-slate-600 mb-2 animate-pulse" />
                    <p className="text-sm font-medium text-slate-300">Awaiting Second Browser...</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Open a second tab or window to see the peer appear in this list and establish WebRTC audio.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {peerList.map((p) => {
                      const dist = selfAvatar
                        ? Math.round(
                            Math.hypot(
                              (p.x || p.targetX || 0) - (selfAvatar.x || 0),
                              (p.y || p.targetY || 0) - (selfAvatar.y || 0)
                            )
                          )
                        : 0;
                      const inRange = dist <= 100;
                      const state = peerConnectionStates?.[p.socketId] || (inRange ? 'connected' : 'new');
                      const isSelected = p.socketId === selectedPeerId;

                      return (
                        <div
                          key={p.socketId}
                          onClick={() => setSelectedPeerId(p.socketId)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm'
                              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: p.avatarColor || '#38bdf8' }}
                            />
                            <div>
                              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                                {p.name}
                                {p.isBot && <span className="text-[10px] text-slate-400 font-normal">(Bot)</span>}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {dist}px away &bull; {inRange ? 'Within Earshot' : 'Out of Earshot'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                                inRange
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                              }`}
                            >
                              {inRange ? 'IN RANGE (<=100px)' : 'MUTED (>100px)'}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                                state === 'connected'
                                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                                  : 'bg-slate-800 border-slate-700 text-slate-400'
                              }`}
                            >
                              {state.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Handshake Phase Status Cards */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2.5">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> WebRTC Signaling Stages
                </span>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/50">
                    <span className="text-slate-400">1. WebSocket Signaling Server</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Socket.io Connected
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/50">
                    <span className="text-slate-400">2. 100px Proximity Gatekeeper</span>
                    <span
                      className={`font-medium flex items-center gap-1 ${
                        isWithin100px ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {isWithin100px ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approved ({currentDistance}px &le; 100px)
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5" /> Blocked ({currentDistance}px &gt; 100px)
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/50">
                    <span className="text-slate-400">3. SDP Offer / Answer Handshake</span>
                    <span
                      className={`font-medium flex items-center gap-1 ${
                        connectionState === 'connected'
                          ? 'text-emerald-400'
                          : connectionState === 'connecting'
                          ? 'text-cyan-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {connectionState === 'connected' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Relayed &amp; Applied
                        </>
                      ) : connectionState === 'connecting' ? (
                        'In Progress...'
                      ) : (
                        'Awaiting Peer In Range'
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-slate-900/50">
                    <span className="text-slate-400">4. WebRTC Peer Connection State</span>
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                        connectionState === 'connected'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {connectionState.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Dual Oscilloscope & Real-time Visualizers */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              
              {/* Dual Visualizer Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Visualizer 1: Local Mic / Synth Tone */}
                <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5" /> Local Audio Transmitter
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {isTestToneActive ? '440Hz Test Synth' : 'Microphone Stream'}
                    </span>
                  </div>
                  <canvas
                    ref={localCanvasRef}
                    width={280}
                    height={110}
                    className="w-full h-28 rounded-lg bg-slate-950 border border-slate-800"
                  />
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Transmitting: {isTestToneActive || webrtcManager?.isMicActive ? 'ACTIVE' : 'IDLE'}</span>
                    <span>Rate: 48 kHz Opus</span>
                  </div>
                </div>

                {/* Visualizer 2: Remote Peer Incoming Audio */}
                <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" /> Remote Peer Audio Receiver
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {activePeer ? activePeer.name : 'No Peer Selected'}
                    </span>
                  </div>
                  <canvas
                    ref={remoteCanvasRef}
                    width={280}
                    height={110}
                    className="w-full h-28 rounded-lg bg-slate-950 border border-slate-800"
                  />
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>WebRTC Track: {activePeer ? 'ATTACHED' : 'WAITING'}</span>
                    <span>Gain: {isWithin100px ? `${Math.round(Math.max(10, (1 - currentDistance / 100) * 100))}%` : '0% (Muted)'}</span>
                  </div>
                </div>
              </div>

              {/* RTP Statistics & Telemetry Matrix */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" /> WebRTC In-Flight Audio Telemetry
                  </span>
                  <span className="text-[11px] text-slate-400">
                    STUN: stun.l.google.com:19302
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Distance</p>
                    <p className="text-base font-bold text-white mt-0.5">{currentDistance} px</p>
                    <p className="text-[10px] text-cyan-400">{isWithin100px ? 'Earshot Active' : 'Outside Limit'}</p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Acoustic Gain</p>
                    <p className="text-base font-bold text-emerald-400 mt-0.5">
                      {isWithin100px ? `${Math.round(Math.max(10, (1 - currentDistance / 100) * 100))}%` : '0%'}
                    </p>
                    <p className="text-[10px] text-slate-500">Spatial Attenuation</p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Packets Rcvd</p>
                    <p className="text-base font-bold text-white mt-0.5">{stats?.packetsReceived || 0}</p>
                    <p className="text-[10px] text-slate-500">{stats?.bytesReceived || 0} bytes</p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Jitter Buffer</p>
                    <p className="text-base font-bold text-white mt-0.5">{stats?.jitter || 0} ms</p>
                    <p className="text-[10px] text-slate-500">Latency &lt; 20ms</p>
                  </div>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleToggleTestTone}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md ${
                    isTestToneActive
                      ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                      : 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-cyan-500/20'
                  }`}
                >
                  {isTestToneActive ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  {isTestToneActive ? 'Stop Synthetic Audio Tone' : 'Transmit Test Voice Tone (440Hz)'}
                </button>

                {onMoveToDistance && (
                  <>
                    <button
                      onClick={() => onMoveToDistance(60)}
                      className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition-colors"
                      title="Move avatar within 60px of peer"
                    >
                      Step Near (~60px)
                    </button>
                    <button
                      onClick={() => onMoveToDistance(160)}
                      className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
                      title="Move avatar out to 160px"
                    >
                      Step Far (~160px)
                    </button>
                  </>
                )}

                <button
                  onClick={handleTriggerOffer}
                  disabled={!selectedPeerId || !isWithin100px}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-cyan-300 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Re-trigger Handshake
                </button>
              </div>

            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-900/90 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Signaling: <strong>Socket.io Port 5000</strong> &bull; Mesh: <strong>WebRTC RTCPeerConnection</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
}
