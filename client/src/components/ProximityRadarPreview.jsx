import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Radio, Navigation, Compass, Sparkles, Activity } from 'lucide-react';

export default function ProximityRadarPreview({ previewAvatarColor = '#6366f1', previewName = 'Your Avatar' }) {
  const canvasRef = useRef(null);
  const [distance, setDistance] = useState(85);
  const [audioGain, setAudioGain] = useState(78);
  const [isWithinEarshot, setIsWithinEarshot] = useState(true);
  const [userCoord, setUserCoord] = useState({ x: 190, y: 150 });
  const [peerCoord] = useState({ x: 260, y: 180 });

  const EARSHOT_RADIUS = 110; // Pixel threshold from specs

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let time = 0;

    const render = () => {
      time += 0.03;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Draw subtle office grid floor
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const gridSize = 25;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Smooth floating motion for preview user avatar
      const currentX = userCoord.x + Math.sin(time) * 12;
      const currentY = userCoord.y + Math.cos(time * 0.8) * 10;

      // Calculate distance between user and peer
      const dx = peerCoord.x - currentX;
      const dy = peerCoord.y - currentY;
      const currentDist = Math.round(Math.sqrt(dx * dx + dy * dy));
      setDistance(currentDist);

      const inEarshot = currentDist <= EARSHOT_RADIUS;
      setIsWithinEarshot(inEarshot);

      // Calculate dynamic Web Audio API gain attenuation
      let calculatedGain = 0;
      if (inEarshot) {
        calculatedGain = Math.round((1 - currentDist / EARSHOT_RADIUS) * 100);
        calculatedGain = Math.max(15, Math.min(100, calculatedGain));
      }
      setAudioGain(calculatedGain);

      // 2. Draw Earshot Radius Circle for User Avatar
      const pulseSize = 4 * Math.sin(time * 2);
      ctx.beginPath();
      ctx.arc(currentX, currentY, EARSHOT_RADIUS + pulseSize, 0, Math.PI * 2);
      ctx.strokeStyle = inEarshot ? 'rgba(99, 102, 241, 0.45)' : 'rgba(100, 116, 139, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Fill earshot zone
      ctx.fillStyle = inEarshot ? 'rgba(99, 102, 241, 0.08)' : 'rgba(100, 116, 139, 0.03)';
      ctx.fill();

      // 3. Draw Audio Connection Line if in Earshot
      if (inEarshot) {
        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        ctx.lineTo(peerCoord.x, peerCoord.y);
        ctx.strokeStyle = `rgba(16, 185, 129, ${calculatedGain / 100})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Sound waves radiating between peers
        const midX = (currentX + peerCoord.x) / 2;
        const midY = (currentY + peerCoord.y) / 2;
        ctx.beginPath();
        ctx.arc(midX, midY, (time * 15) % 30, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.7 - ((time * 15) % 30) / 30})`;
        ctx.stroke();
      }

      // 4. Draw Peer Avatar (Priya - Dev)
      ctx.beginPath();
      ctx.arc(peerCoord.x, peerCoord.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Peer label
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Priya (Dev)', peerCoord.x, peerCoord.y + 26);

      // 5. Draw User Avatar
      ctx.beginPath();
      ctx.arc(currentX, currentY, 16, 0, Math.PI * 2);
      ctx.fillStyle = previewAvatarColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // User label
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(previewName.split(' ')[0] || 'You', currentX, currentY + 30);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [previewAvatarColor, previewName]);

  return (
    <div className="relative bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col justify-between">
      {/* Background radial highlight */}
      <div className="absolute -top-24 -right-24 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Info */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Geospatial Proximity Radar
          </h3>
        </div>
        <span className="text-[11px] font-mono text-cyan-400/90 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded">
          MongoDB $near 2D
        </span>
      </div>

      {/* 2D HTML5 Canvas simulation */}
      <div className="relative my-4 rounded-xl overflow-hidden border border-slate-800 bg-slate-950/90 shadow-inner">
        <canvas
          ref={canvasRef}
          width={380}
          height={260}
          className="w-full h-auto block"
        />

        {/* Live coordinate overlay */}
        <div className="absolute top-2 left-2 text-[10px] font-mono text-slate-400 bg-slate-900/90 px-2 py-1 rounded border border-slate-800 flex items-center space-x-1.5 backdrop-blur-sm">
          <Navigation className="w-3 h-3 text-indigo-400" />
          <span>Coordinates: [{Math.round(userCoord.x)}, {Math.round(userCoord.y)}]</span>
        </div>

        {/* Live Audio Gain Indicator */}
        <div className="absolute bottom-2 right-2 flex items-center space-x-2 bg-slate-900/95 px-2.5 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm">
          {isWithinEarshot ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
              <div className="flex flex-col">
                <span className="text-[10px] text-emerald-400 font-semibold leading-none">
                  Earshot Active ({distance}px)
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  Audio Gain: {audioGain}%
                </span>
              </div>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-medium leading-none">
                  Out of Earshot ({distance}px)
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  Audio Gain: 0%
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Audio Attenuation Specs (Week 1-4 Architecture) */}
      <div className="space-y-2.5 pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-indigo-400" />
            Dynamic Crossfading
          </span>
          <span className="text-slate-200 font-mono font-medium">
            Web Audio API 3D
          </span>
        </div>

        {/* Visual equalizer wave */}
        <div className="h-6 flex items-center justify-center space-x-1 bg-slate-950/60 rounded-lg border border-slate-800/80 px-4">
          <span className={`w-1 rounded-full bg-cyan-400 ${isWithinEarshot ? 'animate-wave-1' : 'h-1'}`} />
          <span className={`w-1 rounded-full bg-indigo-400 ${isWithinEarshot ? 'animate-wave-2' : 'h-1'}`} />
          <span className={`w-1 rounded-full bg-violet-400 ${isWithinEarshot ? 'animate-wave-3' : 'h-1'}`} />
          <span className={`w-1 rounded-full bg-emerald-400 ${isWithinEarshot ? 'animate-wave-4' : 'h-1'}`} />
          <span className={`w-1 rounded-full bg-cyan-400 ${isWithinEarshot ? 'animate-wave-2' : 'h-1'}`} />
          <span className={`w-1 rounded-full bg-indigo-400 ${isWithinEarshot ? 'animate-wave-1' : 'h-1'}`} />
          <span className={`w-1 rounded-full bg-violet-400 ${isWithinEarshot ? 'animate-wave-3' : 'h-1'}`} />
        </div>

        <p className="text-[11px] text-slate-400 text-center leading-relaxed">
          Walk your avatar closer to colleagues to automatically join natural, spatial conversations without Zoom room fatigue.
        </p>
      </div>
    </div>
  );
}
