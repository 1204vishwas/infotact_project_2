import React, { useRef, useEffect, useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Activity,
  Headphones,
  Radio,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square
} from 'lucide-react';

export default function AudioWaveformVisualizer({
  webrtcManager,
  isMicActive,
  isMicMuted,
  onToggleMic,
  onInitMic,
  connectedPeersCount = 0,
  className = ''
}) {
  const canvasRef = useRef(null);
  const [isLoopbackActive, setIsLoopbackActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [decibels, setDecibels] = useState(-60);
  const [visualizerMode, setVisualizerMode] = useState('waveform'); // 'waveform' | 'spectrum' | 'both'

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const bufferLength = 64;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameId = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
      bgGrad.addColorStop(1, 'rgba(10, 15, 29, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle grid
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Fetch live audio data from WebRTC manager
      if (webrtcManager) {
        webrtcManager.getLocalWaveformData(timeData);
        webrtcManager.getLocalFrequencyData(freqData);
        const lvl = webrtcManager.getLocalAudioLevel();
        setAudioLevel(lvl);

        // Approximate dB
        const db = lvl > 0 ? Math.round(20 * Math.log10(Math.max(lvl, 0.001))) : -60;
        setDecibels(Math.max(-60, Math.min(0, db)));
      }

      const isSpeaking = audioLevel > 0.05 && !isMicMuted;

      // --- 1. DRAW FREQUENCY SPECTRUM BARS ---
      if (visualizerMode === 'spectrum' || visualizerMode === 'both') {
        const barCount = 32;
        const barWidth = (width / barCount) - 2;

        for (let i = 0; i < barCount; i++) {
          const val = freqData[i] || 0;
          const percent = val / 255;
          const barHeight = Math.max(3, percent * (height - 12));

          const x = i * (barWidth + 2) + 2;
          const y = height - barHeight - 4;

          // Color gradient from cyan to indigo to pink
          const barGrad = ctx.createLinearGradient(0, height, 0, y);
          if (isSpeaking) {
            barGrad.addColorStop(0, '#06b6d4');
            barGrad.addColorStop(0.6, '#6366f1');
            barGrad.addColorStop(1, '#ec4899');
          } else {
            barGrad.addColorStop(0, '#1e293b');
            barGrad.addColorStop(1, '#334155');
          }

          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
          ctx.fill();
        }
      }

      // --- 2. DRAW OSCILLOSCOPE TIME-DOMAIN WAVEFORM ---
      if (visualizerMode === 'waveform' || visualizerMode === 'both') {
        ctx.lineWidth = isSpeaking ? 2.5 : 1.5;
        const waveGrad = ctx.createLinearGradient(0, 0, width, 0);
        if (isSpeaking) {
          waveGrad.addColorStop(0, '#38bdf8');
          waveGrad.addColorStop(0.5, '#818cf8');
          waveGrad.addColorStop(1, '#f472b6');
        } else {
          waveGrad.addColorStop(0, 'rgba(100, 116, 139, 0.4)');
          waveGrad.addColorStop(1, 'rgba(71, 85, 105, 0.4)');
        }
        ctx.strokeStyle = waveGrad;

        // Glow effect when speaking
        if (isSpeaking) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#38bdf8';
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0; // 128 is center
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0; // Reset
      }

      // Center baseline indicator
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [webrtcManager, isMicMuted, visualizerMode, audioLevel]);

  const handleToggleLoopback = async () => {
    if (!webrtcManager) return;
    if (isLoopbackActive) {
      webrtcManager.stopLoopbackTest();
      setIsLoopbackActive(false);
    } else {
      const ok = await webrtcManager.startLoopbackTest();
      if (ok) setIsLoopbackActive(true);
    }
  };

  return (
    <div className={`bg-slate-900/90 rounded-2xl border border-slate-800 p-3 shadow-xl backdrop-blur-md ${className}`}>
      {/* Header with status badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center space-x-2">
          <div className={`p-1.5 rounded-lg ${isMicActive && !isMicMuted ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold text-white">WebRTC Audio Visualizer</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                Canvas API
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {isMicActive
                ? isMicMuted
                  ? 'Microphone Muted'
                  : 'Broadcasting Live Mic Stream'
                : 'Microphone Inactive'}
            </p>
          </div>
        </div>

        {/* Action Buttons & Visualizer Mode Selector */}
        <div className="flex items-center space-x-1.5">
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px]">
            <button
              type="button"
              onClick={() => setVisualizerMode('waveform')}
              className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${visualizerMode === 'waveform' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Wave
            </button>
            <button
              type="button"
              onClick={() => setVisualizerMode('spectrum')}
              className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${visualizerMode === 'spectrum' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              FFT
            </button>
            <button
              type="button"
              onClick={() => setVisualizerMode('both')}
              className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${visualizerMode === 'both' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Dual
            </button>
          </div>

          {/* Loopback Test Button */}
          <button
            type="button"
            onClick={handleToggleLoopback}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border flex items-center space-x-1 cursor-pointer transition-all ${
              isLoopbackActive
                ? 'bg-rose-950/70 border-rose-500/50 text-rose-300 hover:bg-rose-900/70 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Test local WebRTC audio loopback in-browser"
          >
            {isLoopbackActive ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 text-cyan-400" />}
            <span>{isLoopbackActive ? 'Stop Test' : 'Audio Test'}</span>
          </button>
        </div>
      </div>

      {/* Main HTML5 Canvas Oscilloscope */}
      <div className="relative rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950">
        <canvas
          ref={canvasRef}
          width={480}
          height={70}
          className="w-full h-16 block"
        />

        {/* Canvas overlay badges */}
        <div className="absolute top-1.5 left-2 flex items-center space-x-2 pointer-events-none">
          <span className="text-[9px] font-mono text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
            {decibels > -55 ? `${decibels} dB` : '-∞ dB'}
          </span>
          {audioLevel > 0.05 && !isMicMuted && (
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              VOICE ACTIVE
            </span>
          )}
        </div>

        <div className="absolute bottom-1.5 right-2 flex items-center space-x-2 pointer-events-none">
          <span className="text-[9px] font-mono text-cyan-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
            Opus 48kHz
          </span>
          <span className="text-[9px] font-mono text-indigo-300 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
            {connectedPeersCount} P2P {connectedPeersCount === 1 ? 'Peer' : 'Peers'}
          </span>
        </div>
      </div>

      {/* Footer controls: Mic button & Audio Diagnostics */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60 text-xs">
        <div className="flex items-center space-x-2">
          {isMicActive ? (
            <button
              type="button"
              onClick={onToggleMic}
              className={`px-3 py-1 rounded-xl text-[11px] font-semibold flex items-center space-x-1.5 border cursor-pointer transition-all ${
                isMicMuted
                  ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 hover:bg-rose-900/60'
                  : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60'
              }`}
            >
              {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isMicMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onInitMic}
              className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 cursor-pointer transition-all"
            >
              <Mic className="w-3.5 h-3.5 text-cyan-300" />
              <span>Enable Microphone</span>
            </button>
          )}

          <div className="hidden sm:flex items-center space-x-1 text-[10px] text-slate-400 font-mono">
            <span>AGC:</span> <strong className="text-emerald-400">ON</strong>
            <span className="mx-1">•</span>
            <span>AEC:</span> <strong className="text-emerald-400">ON</strong>
          </div>
        </div>

        {/* Volume Level Indicator Bar */}
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-slate-400 font-mono">Input:</span>
          <div className="w-20 sm:w-28 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5 flex">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                audioLevel > 0.6 ? 'bg-rose-500' : audioLevel > 0.2 ? 'bg-emerald-400' : 'bg-cyan-400'
              }`}
              style={{ width: `${Math.min(100, Math.round(audioLevel * 100))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
