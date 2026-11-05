/**
 * ProxiSpeak WebRTC Audio Manager
 * Infotact Solutions - Geospatial Proximity Audio Ecosystem
 *
 * Implements standard WebRTC peer-to-peer audio connections using the browser's
 * navigator.mediaDevices.getUserMedia, Web Audio API synthetic audio test streams,
 * and Web Audio API for spatial distance attenuation and Canvas API visualization.
 */

import {
  calculateAttenuation,
  ATTENUATION_MODELS,
  ATTENUATION_MODEL_METADATA,
  DEFAULT_ATTENUATION_CONFIG,
  generateAttenuationCurve
} from './audioAttenuation';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

/**
 * Munges WebRTC Session Description Protocol (SDP) to enforce optimal voice mesh settings:
 * 1. Opus 32kbps wideband bitrate cap (saves up to 75% upstream bandwidth vs 128kbps stereo)
 * 2. DTX (Discontinuous Transmission) silence suppression (cuts bandwidth 80-90% when listening)
 * 3. In-band FEC (Forward Error Correction) for packet loss recovery
 * 4. Mono channel mode (spatialization is calculated client-side via Web Audio StereoPanner)
 */
export function optimizeAudioSdp(sdp, options = {}) {
  if (!sdp || typeof sdp !== 'string') return sdp;

  const {
    bitrate = 32000,
    enableDtx = true,
    enableFec = true,
    mono = true
  } = options;

  let lines = sdp.split(/\r?\n/);

  // Identify Opus dynamic RTP payload number
  let opusPayload = '111';
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPayload = match[1];
      break;
    }
  }

  let fmtpUpdated = false;
  lines = lines.map((line) => {
    if (line.startsWith(`a=fmtp:${opusPayload}`)) {
      fmtpUpdated = true;
      let fmtp = line;
      if (bitrate && !fmtp.includes('maxaveragebitrate')) {
        fmtp += `;maxaveragebitrate=${bitrate}`;
      }
      if (enableDtx && !fmtp.includes('usedtx')) {
        fmtp += ';usedtx=1';
      }
      if (enableFec && !fmtp.includes('useinbandfec')) {
        fmtp += ';useinbandfec=1';
      }
      if (mono && !fmtp.includes('stereo=')) {
        fmtp += ';stereo=0;sprop-stereo=0';
      }
      if (!fmtp.includes('minptime=')) {
        fmtp += ';minptime=10';
      }
      return fmtp;
    }
    return line;
  });

  if (!fmtpUpdated) {
    const rtpIdx = lines.findIndex((l) => l.startsWith(`a=rtpmap:${opusPayload}`));
    if (rtpIdx !== -1) {
      lines.splice(
        rtpIdx + 1,
        0,
        `a=fmtp:${opusPayload} minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=${bitrate};stereo=0;sprop-stereo=0`
      );
    }
  }

  return lines.join('\r\n') + '\r\n';
}

export class WebRTCAudioManager {
  constructor({ onAudioLevelUpdate, onConnectionStateChange, showToast } = {}) {
    this.localStream = null;
    this.audioContext = null;
    this.localAnalyser = null;
    this.localSource = null;
    this.isMicMuted = false;
    this.isMicActive = false;
    this.isSyntheticActive = false;
    this.permissionState = 'prompt'; // 'prompt' | 'granted' | 'denied' | 'unsupported'

    // Synthetic audio nodes
    this.syntheticNodes = null;

    // Peer connections map: socketId -> { pc, stream, audioElement, gainNode, analyser, connectionState, distance, gain }
    this.peers = new Map();

    // Queued ICE candidates awaiting remote description: socketId -> RTCIceCandidateInit[]
    this.iceCandidateQueues = new Map();

    // Callbacks
    this.onAudioLevelUpdate = onAudioLevelUpdate || (() => {});
    this.onConnectionStateChange = onConnectionStateChange || (() => {});
    this.showToast = showToast || (() => {});

    // Audio level cache (0.0 to 1.0)
    this.localAudioLevel = 0;
    this.peerAudioLevels = new Map(); // socketId -> level

    // WebRTC Mesh Scaling & Density Optimization
    this.maxMeshPeers = 6; // Max concurrent active audio connections (Cocktail Party limit)
    this.culledPeers = new Set(); // In-range peers on standby due to density limit
    this.hysteresisRadius = 115; // Proximity release threshold buffer

    // Dynamic Attenuation & Spatial Web Audio API Configuration
    this.attenuationConfig = { ...DEFAULT_ATTENUATION_CONFIG };

    // Loopback test session
    this.loopbackSession = null;
  }

  /**
   * Set active distance attenuation model ('exponential' | 'smoothstep' | 'inverse' | 'linear' | 'logarithmic')
   */
  setAttenuationModel(model) {
    if (Object.values(ATTENUATION_MODELS).includes(model)) {
      this.attenuationConfig.model = model;
      this.recalculateAllPeerAttenuation();
      return true;
    }
    return false;
  }

  /**
   * Update attenuation parameters (e.g. minRadius, maxRadius, minGain, rolloff, etc.)
   */
  updateAttenuationConfig(updates = {}) {
    this.attenuationConfig = { ...this.attenuationConfig, ...updates };
    this.recalculateAllPeerAttenuation();
    return this.getAttenuationConfig();
  }

  /**
   * Retrieve current attenuation configuration
   */
  getAttenuationConfig() {
    return { ...this.attenuationConfig };
  }

  /**
   * Retrieve metadata for all available attenuation models
   */
  getAvailableAttenuationModels() {
    return ATTENUATION_MODEL_METADATA;
  }

  /**
   * Calculate attenuation metrics for a specific distance without mutating state
   */
  calculateAttenuation(distance, options = {}) {
    return calculateAttenuation(distance, { ...this.attenuationConfig, ...options });
  }

  /**
   * Generate attenuation curve data points for real-time visualization
   */
  generateAttenuationCurve(model = null, options = {}, steps = 120) {
    const activeModel = model || this.attenuationConfig.model;
    return generateAttenuationCurve(activeModel, { ...this.attenuationConfig, ...options }, steps);
  }

  /**
   * Re-evaluate volume drop-off and spatial panning for all connected peers
   */
  recalculateAllPeerAttenuation() {
    this.peers.forEach((peerData, peerSocketId) => {
      if (peerData.distance !== undefined) {
        this.setPeerDistance(
          peerSocketId,
          peerData.distance,
          this.attenuationConfig.maxRadius,
          peerData.deltaX !== undefined ? peerData.deltaX : null,
          peerData.isCulled || false,
          this.attenuationConfig.hysteresisRadius
        );
      }
    });
  }

  /**
   * Safe getter / initializer for AudioContext (handles autoplay policy resume)
   */
  getAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch((e) => console.warn('[WebRTC Audio] Resume AudioContext:', e));
    }
    return this.audioContext;
  }

  /**
   * Request microphone access using navigator.mediaDevices.getUserMedia
   * Returns: Promise<MediaStream | null>
   */
  async initMicrophone() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.permissionState = 'unsupported';
      this.showToast('Your browser does not support WebRTC audio (getUserMedia).', 'error');
      return null;
    }

    try {
      console.log('[WebRTC Audio] Requesting getUserMedia with echo cancellation & noise suppression...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
        video: false
      });

      // If synthetic audio was running, stop it
      if (this.isSyntheticActive) {
        this.stopSyntheticAudio(false);
      }

      this.localStream = stream;
      this.isMicActive = true;
      this.isSyntheticActive = false;
      this.permissionState = 'granted';

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        this.replaceLocalTrackAcrossPeers(audioTrack);
      }

      // Setup Web Audio API analyser for Canvas visualization
      this.setupLocalAudioAnalyser(stream);

      this.showToast('Microphone activated! WebRTC spatial audio mesh ready.', 'success');
      return stream;
    } catch (err) {
      console.error('[WebRTC Audio] getUserMedia error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.permissionState = 'denied';
        this.showToast('Microphone permission was denied. Try enabling the Synthetic Audio Test Tone.', 'error');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        this.permissionState = 'denied';
        this.showToast('No microphone hardware detected. Try enabling Synthetic Audio Test Tone.', 'error');
      } else {
        this.permissionState = 'prompt';
        this.showToast(`Microphone error: ${err.message}`, 'error');
      }
      return null;
    }
  }

  /**
   * Start synthetic audio test tone generator (440 Hz vocal formant simulator).
   * Generates a real MediaStream with real audio frames via Web Audio API.
   * Perfect for demonstrating two-browser audio transmission without physical microphone dependencies.
   */
  startSyntheticAudio(frequency = 440) {
    try {
      const audioCtx = this.getAudioContext();
      if (!audioCtx) return null;

      this.stopSyntheticAudio(false);

      const dest = audioCtx.createMediaStreamDestination();
      const osc = audioCtx.createOscillator();
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      const gainNode = audioCtx.createGain();

      // Vocal formant modulation: subtle 5 Hz vibrato
      lfo.frequency.setValueAtTime(5.2, audioCtx.currentTime);
      lfoGain.gain.setValueAtTime(6.0, audioCtx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      // Main vocal tone oscillator
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

      // Low-pass filter to sound warm and vocal-like
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, audioCtx.currentTime);
      filter.Q.setValueAtTime(3.5, audioCtx.currentTime);

      // Safe master gain for transmission
      gainNode.gain.setValueAtTime(0.35, audioCtx.currentTime);

      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(dest);

      osc.start();
      lfo.start();

      this.syntheticNodes = { osc, lfo, lfoGain, filter, gainNode, dest };
      this.localStream = dest.stream;
      this.isMicActive = true;
      this.isSyntheticActive = true;

      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) {
        this.replaceLocalTrackAcrossPeers(audioTrack);
      }

      this.setupLocalAudioAnalyser(dest.stream);

      this.showToast(`Synthetic Voice Tone (${frequency}Hz) active! Transmitting over WebRTC mesh.`, 'success');
      return dest.stream;
    } catch (err) {
      console.error('[WebRTC Audio] Error starting synthetic test audio:', err);
      this.showToast(`Failed to generate synthetic audio: ${err.message}`, 'error');
      return null;
    }
  }

  /**
   * Stop synthetic audio test tone generator
   */
  stopSyntheticAudio(notify = true) {
    if (this.syntheticNodes) {
      try {
        this.syntheticNodes.osc.stop();
        this.syntheticNodes.lfo.stop();
        this.syntheticNodes.osc.disconnect();
        this.syntheticNodes.lfo.disconnect();
        this.syntheticNodes.filter.disconnect();
        this.syntheticNodes.gainNode.disconnect();
      } catch (e) {}
      this.syntheticNodes = null;
    }

    if (this.isSyntheticActive) {
      this.isSyntheticActive = false;
      this.isMicActive = false;
      this.localStream = null;
      if (notify) this.showToast('Synthetic audio tone stopped.', 'info');
    }
  }

  /**
   * Seamlessly replace the local audio track across all active RTCPeerConnections
   * without renegotiation using RTCRtpSender.replaceTrack
   */
  replaceLocalTrackAcrossPeers(newTrack) {
    this.peers.forEach(({ pc }) => {
      if (pc.signalingState !== 'closed') {
        const senders = pc.getSenders();
        const audioSender = senders.find((s) => s.track?.kind === 'audio' || s.track === null);
        if (audioSender) {
          audioSender.replaceTrack(newTrack).catch((err) => {
            console.warn('[WebRTC P2P] Error replacing audio track:', err);
          });
        } else {
          try {
            pc.addTrack(newTrack, this.localStream);
          } catch (e) {
            console.warn('[WebRTC P2P] Error adding track:', e);
          }
        }
      }
    });
  }

  /**
   * Configure Web Audio API AnalyserNode for local audio stream (mic or synth)
   */
  setupLocalAudioAnalyser(stream) {
    try {
      const audioCtx = this.getAudioContext();
      if (!audioCtx) return;

      if (this.localSource) {
        try { this.localSource.disconnect(); } catch (e) {}
      }

      this.localSource = audioCtx.createMediaStreamSource(stream);
      this.localAnalyser = audioCtx.createAnalyser();
      this.localAnalyser.fftSize = 64;
      this.localAnalyser.smoothingTimeConstant = 0.6;

      this.localSource.connect(this.localAnalyser);
      // NOTE: Do NOT connect localAnalyser to audioCtx.destination to prevent local echo loop
    } catch (err) {
      console.warn('[WebRTC Audio] Error setting up local audio analyser:', err);
    }
  }

  /**
   * Toggle local microphone / synthetic audio mute
   */
  setMuted(muted) {
    this.isMicMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    return this.isMicMuted;
  }

  /**
   * Create or retrieve an RTCPeerConnection for a remote peer
   */
  createPeerConnection(peerSocketId, { onIceCandidate, onTrack, onConnectionStateChange } = {}) {
    if (this.peers.has(peerSocketId)) {
      const existing = this.peers.get(peerSocketId);
      if (existing.pc.signalingState !== 'closed') {
        return existing.pc;
      }
      this.closePeerConnection(peerSocketId);
    }

    console.log(`[WebRTC P2P] Initializing RTCPeerConnection for peer: ${peerSocketId}`);
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Attach local audio tracks if available, otherwise add transceiver to ensure m=audio in SDP
    if (this.localStream && this.localStream.getAudioTracks().length > 0) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      } catch (err) {
        console.warn('[WebRTC P2P] Transceiver setup warning:', err);
      }
    }

    // ICE candidate gathering
    pc.onicecandidate = (event) => {
      if (event.candidate && onIceCandidate) {
        onIceCandidate(event.candidate);
      }
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC P2P] Peer '${peerSocketId}' connectionState: ${state}`);
      const peerData = this.peers.get(peerSocketId);
      if (peerData) {
        peerData.connectionState = state;
      }
      if (onConnectionStateChange) {
        onConnectionStateChange(state);
      }
      this.onConnectionStateChange(peerSocketId, state);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC P2P] Peer '${peerSocketId}' iceConnectionState: ${pc.iceConnectionState}`);
    };

    // Remote audio track handler
    pc.ontrack = (event) => {
      console.log(`[WebRTC P2P] Received remote audio track from peer: ${peerSocketId}`);
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.setupRemoteAudioStream(peerSocketId, remoteStream);
      if (onTrack) onTrack(remoteStream);
    };

    // Store in peers map
    this.peers.set(peerSocketId, {
      pc,
      stream: null,
      audioElement: null,
      sourceNode: null,
      filterNode: null,
      pannerNode: null,
      panner3DNode: null,
      gainNode: null,
      analyser: null,
      connectionState: 'new',
      distance: 50,
      deltaX: 0,
      deltaY: 0,
      deltaZ: 0,
      gain: 1.0,
      gainPercent: 100,
      decibels: 0,
      filterFreq: 20000,
      pan: 0,
      spatial3D: {
        pan: 0,
        azimuthDeg: 0,
        elevationDeg: 0,
        itdMs: 0,
        ildDb: 0,
        rearOcclusionFactor: 1.0,
        stereoSeparation: 1.0
      },
      isAudible: true,
      inHysteresis: false,
      isCulled: false,
      model: this.attenuationConfig.model,
      stats: { bytesReceived: 0, packetsReceived: 0, bytesSent: 0, packetsSent: 0, audioLevel: 0, jitter: 0 }
    });

    return pc;
  }

  /**
   * Hook WebRTC remote audio stream into the Web Audio API graph
   * Architecture:
   * MediaStreamSource -> BiquadFilter (Air Absorption) -> StereoPanner (2D Binaural) -> GainNode (Distance Drop-Off) -> AnalyserNode -> AudioContext.destination
   * Plus HTML5 audio element (muted = true) for reliable Chromium RTP track consumption.
   */
  setupRemoteAudioStream(peerSocketId, remoteStream) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData) return;

    peerData.stream = remoteStream;

    // 1. Maintain an HTML5 Audio element with muted = true
    // In Chromium browsers, an audio element sink ensures the WebRTC MediaStreamTrack
    // is decoded without throttling. Setting muted = true prevents duplicate audio leakage
    // while the Web Audio API graph handles all audible playback and spatial rendering.
    let audioElement = peerData.audioElement;
    if (!audioElement) {
      audioElement = new Audio();
      audioElement.autoplay = true;
      audioElement.playsInline = true;
      audioElement.muted = true;
    }
    audioElement.srcObject = remoteStream;
    audioElement.play().catch((err) => {
      console.log('[WebRTC Audio] Remote audio element playback pending user gesture:', err);
    });
    peerData.audioElement = audioElement;

    // 2. Build full Web Audio API node graph
    try {
      const audioCtx = this.getAudioContext();
      if (audioCtx) {
        // Disconnect existing nodes if stream is being re-hooked
        if (peerData.sourceNode) {
          try { peerData.sourceNode.disconnect(); } catch (e) {}
        }
        if (peerData.filterNode) {
          try { peerData.filterNode.disconnect(); } catch (e) {}
        }
        if (peerData.pannerNode) {
          try { peerData.pannerNode.disconnect(); } catch (e) {}
        }
        if (peerData.panner3DNode) {
          try { peerData.panner3DNode.disconnect(); } catch (e) {}
        }
        if (peerData.gainNode) {
          try { peerData.gainNode.disconnect(); } catch (e) {}
        }
        if (peerData.analyser) {
          try { peerData.analyser.disconnect(); } catch (e) {}
        }

        const sourceNode = audioCtx.createMediaStreamSource(remoteStream);

        // Acoustic low-pass air absorption filter (distant audio loses high frequencies)
        const filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        const initialFilterFreq = peerData.filterFreq || this.attenuationConfig.filterCeilingHz || 20000;
        filterNode.frequency.setValueAtTime(initialFilterFreq, audioCtx.currentTime);
        filterNode.Q.setValueAtTime(0.707, audioCtx.currentTime);

        // 1. Web Audio API 3D PannerNode (HRTF Binaural 3D Spatial Audio)
        let panner3DNode = null;
        if (typeof audioCtx.createPanner === 'function') {
          try {
            panner3DNode = audioCtx.createPanner();
            panner3DNode.panningModel = 'HRTF'; // Head-Related Transfer Function for realistic 3D binaural audio
            panner3DNode.distanceModel = 'none'; // Custom mathematical attenuation via GainNode
            const scale = 0.02; // 50px = 1 meter in audio space
            const initialX = (peerData.deltaX || 0) * scale;
            const initialY = (peerData.deltaY || 0) * scale;
            const initialZ = (peerData.deltaZ || 0) * scale;
            if (panner3DNode.positionX) {
              panner3DNode.positionX.setValueAtTime(initialX, audioCtx.currentTime);
              panner3DNode.positionY.setValueAtTime(initialY, audioCtx.currentTime);
              panner3DNode.positionZ.setValueAtTime(initialZ, audioCtx.currentTime);
            } else if (typeof panner3DNode.setPosition === 'function') {
              panner3DNode.setPosition(initialX, initialY, initialZ);
            }
          } catch (err) {
            console.warn('[WebRTC Audio] 3D PannerNode initialization notice:', err);
          }
        }

        // 2. Web Audio API StereoPannerNode (Direct Left/Right Stereo Separation & Interaural Panning)
        let pannerNode = null;
        if (typeof audioCtx.createStereoPanner === 'function') {
          pannerNode = audioCtx.createStereoPanner();
          const initialPan = peerData.pan !== undefined ? peerData.pan : 0;
          pannerNode.pan.setValueAtTime(initialPan, audioCtx.currentTime);
        }

        // Gain node for distance volume attenuation with sub-millisecond click-free ramping
        const gainNode = audioCtx.createGain();
        const initialGain = peerData.gain !== undefined ? peerData.gain : 0.8;
        gainNode.gain.setValueAtTime(initialGain, audioCtx.currentTime);

        // Analyser node for FFT spectrum and oscilloscope visualization
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.6;

        // Connect the Web Audio 3D spatial chain:
        // source -> filterNode -> panner3DNode (HRTF) -> pannerNode (Stereo Separation) -> gainNode -> analyser -> destination
        let lastNode = filterNode;
        sourceNode.connect(filterNode);

        if (panner3DNode && this.attenuationConfig.enable3DAudio) {
          lastNode.connect(panner3DNode);
          lastNode = panner3DNode;
        }

        if (pannerNode) {
          lastNode.connect(pannerNode);
          lastNode = pannerNode;
        }

        lastNode.connect(gainNode);
        gainNode.connect(analyser);

        // Output directly to browser audio destination (speakers/headphones)
        analyser.connect(audioCtx.destination);

        peerData.sourceNode = sourceNode;
        peerData.filterNode = filterNode;
        peerData.panner3DNode = panner3DNode;
        peerData.pannerNode = pannerNode;
        peerData.gainNode = gainNode;
        peerData.analyser = analyser;

        console.log(`[WebRTC Audio] Successfully hooked WebRTC track for peer '${peerSocketId}' into 3D Web Audio API (HRTF + Stereo Separation).`);

        // Re-apply current distance attenuation parameters
        if (peerData.distance !== undefined) {
          this.setPeerDistance(
            peerSocketId,
            peerData.distance,
            this.attenuationConfig.maxRadius,
            peerData.deltaX !== undefined ? peerData.deltaX : null,
            peerData.isCulled || false,
            this.attenuationConfig.hysteresisRadius
          );
        }
      }
    } catch (err) {
      console.warn('[WebRTC Audio] Web Audio graph setup error for peer:', err);
    }
  }

  /**
   * Initiate a WebRTC offer for a target peer (with Opus 32kbps, DTX & FEC optimization)
   */
  async createOffer(peerSocketId) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData) {
      throw new Error(`Peer connection for ${peerSocketId} does not exist.`);
    }

    const pc = peerData.pc;
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      voiceActivityDetection: true
    });

    // Apply WebRTC Mesh Bandwidth & Codec Optimization
    const optimizedSdp = optimizeAudioSdp(offer.sdp, {
      bitrate: 32000,
      enableDtx: true,
      enableFec: true,
      mono: true
    });
    const optimizedOffer = { type: offer.type, sdp: optimizedSdp };

    await pc.setLocalDescription(optimizedOffer);
    console.log(`[WebRTC P2P] Created and set optimized local offer (32kbps Opus + DTX) for peer: ${peerSocketId}`);
    return optimizedOffer;
  }

  /**
   * Handle an incoming WebRTC offer from a caller (with Opus 32kbps, DTX & FEC optimization)
   */
  async handleOffer(callerSocketId, offer) {
    const peerData = this.peers.get(callerSocketId);
    if (!peerData) {
      throw new Error(`Peer connection for caller ${callerSocketId} not initialized.`);
    }

    const pc = peerData.pc;

    // Set remote description
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log(`[WebRTC P2P] Applied remote offer from caller: ${callerSocketId}`);

    // Flush any queued ICE candidates that arrived before remote description was ready
    await this.flushQueuedIceCandidates(callerSocketId);

    // Create and set local answer
    const answer = await pc.createAnswer();
    const optimizedSdp = optimizeAudioSdp(answer.sdp, {
      bitrate: 32000,
      enableDtx: true,
      enableFec: true,
      mono: true
    });
    const optimizedAnswer = { type: answer.type, sdp: optimizedSdp };

    await pc.setLocalDescription(optimizedAnswer);
    console.log(`[WebRTC P2P] Created and set optimized local answer (32kbps Opus + DTX) for caller: ${callerSocketId}`);
    return optimizedAnswer;
  }

  /**
   * Handle an incoming WebRTC answer from a callee
   */
  async handleAnswer(calleeSocketId, answer) {
    const peerData = this.peers.get(calleeSocketId);
    if (!peerData) {
      console.warn(`[WebRTC P2P] Received answer for unknown peer: ${calleeSocketId}`);
      return;
    }

    const pc = peerData.pc;
    if (pc.signalingState === 'have-local-offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`[WebRTC P2P] Applied remote answer from callee: ${calleeSocketId}`);

      // Flush any queued ICE candidates
      await this.flushQueuedIceCandidates(calleeSocketId);
    } else {
      console.warn(`[WebRTC P2P] Ignored answer for peer ${calleeSocketId} in state ${pc.signalingState}`);
    }
  }

  /**
   * Handle an incoming ICE candidate (safely queues early candidates)
   */
  async handleIceCandidate(senderSocketId, candidate) {
    if (!candidate) return;

    const peerData = this.peers.get(senderSocketId);
    const pc = peerData?.pc;

    // If peer connection exists and remote description is set, add directly
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn(`[WebRTC P2P] Error adding ICE candidate:`, err);
      }
    } else {
      // Safe queue: keep candidate until remote description is ready
      if (!this.iceCandidateQueues.has(senderSocketId)) {
        this.iceCandidateQueues.set(senderSocketId, []);
      }
      this.iceCandidateQueues.get(senderSocketId).push(candidate);
    }
  }

  /**
   * Drain and apply queued ICE candidates
   */
  async flushQueuedIceCandidates(socketId) {
    const queue = this.iceCandidateQueues.get(socketId) || [];
    const peerData = this.peers.get(socketId);
    if (!peerData || !peerData.pc) return;

    const pc = peerData.pc;
    while (queue.length > 0) {
      const candidate = queue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn(`[WebRTC P2P] Error applying queued ICE candidate:`, err);
      }
    }
    this.iceCandidateQueues.delete(socketId);
  }

  /**
   * Update 3D Audio Listener coordinates & orientation in Web Audio API
   * Maps 2D/3D canvas coordinates to standard Web Audio listener space
   */
  setListenerPosition(x, y, z = 0, forwardX = 0, forwardY = -1, forwardZ = 0) {
    try {
      const audioCtx = this.getAudioContext();
      if (!audioCtx || !audioCtx.listener) return;
      const now = audioCtx.currentTime;
      const listener = audioCtx.listener;

      // Coordinate scaling (e.g. 50px = 1 meter in real-world acoustics)
      const scale = 0.02;
      const posX = (x - 480) * scale;
      const posY = (y - 320) * scale;
      const posZ = z * scale;

      if (listener.positionX) {
        listener.positionX.setTargetAtTime(posX, now, 0.035);
        listener.positionY.setTargetAtTime(posY, now, 0.035);
        listener.positionZ.setTargetAtTime(posZ, now, 0.035);
        if (listener.forwardX) {
          listener.forwardX.setTargetAtTime(forwardX, now, 0.035);
          listener.forwardY.setTargetAtTime(forwardY, now, 0.035);
          listener.forwardZ.setTargetAtTime(forwardZ, now, 0.035);
          listener.upX.setTargetAtTime(0, now, 0.035);
          listener.upY.setTargetAtTime(0, now, 0.035);
          listener.upZ.setTargetAtTime(1, now, 0.035);
        }
      } else if (typeof listener.setPosition === 'function') {
        listener.setPosition(posX, posY, posZ);
        if (typeof listener.setOrientation === 'function') {
          listener.setOrientation(forwardX, forwardY, forwardZ, 0, 0, 1);
        }
      }
    } catch (e) {}
  }

  /**
   * Set stereo separation factor (0.0 = mono, 1.0 = standard stereo separation, 1.5 = wide separation)
   */
  setStereoSeparation(factor) {
    const val = Math.max(0.0, Math.min(2.0, typeof factor === 'number' ? factor : 1.0));
    this.attenuationConfig.stereoSeparation = val;
    this.recalculateAllPeerAttenuation();
    return val;
  }

  /**
   * Set 3D spatial panning mode ('hrtf' | 'stereo')
   */
  setPanningMode(mode) {
    if (['hrtf', 'stereo', 'equalpower'].includes(mode)) {
      this.attenuationConfig.panningMode = mode;
      this.recalculateAllPeerAttenuation();
      return true;
    }
    return false;
  }

  /**
   * Dynamically adjust remote peer audio volume based on Euclidean distance on canvas
   * Supports:
   * - Configurable attenuation models: Exponential (Psychoacoustic), Smoothstep S-Curve, Inverse Distance, Linear, and Logarithmic dB
   * - Acoustic high-frequency air absorption filter (low-pass cutoff frequency in Hz)
   * - 3D Audio Panning with Web Audio API HRTF PannerNode
   * - Full Binaural Stereo Separation with Azimuth angle, ITD & ILD calculation
   * - Click-free exponential parameter ramping via Web Audio API setTargetAtTime
   * - Hysteresis release cushion zone (100px - 115px soft cosine fade)
   * - Density culling state (muting culled peers to prevent CPU/audio saturation)
   */
  setPeerDistance(
    peerSocketId,
    distance,
    maxRadius = 100,
    deltaX = null,
    deltaY = null,
    isCulled = false,
    hysteresisRadius = 115,
    isSoundBlocked = false,
    deltaZ = 0
  ) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData) return null;

    peerData.distance = distance;
    peerData.isCulled = !!isCulled;
    peerData.deltaX = deltaX;
    peerData.deltaY = deltaY;
    peerData.deltaZ = deltaZ;
    peerData.isSoundBlocked = !!isSoundBlocked;

    // Calculate dynamic attenuation using the configured mathematical model
    // If sound is blocked by an acoustic obstacle, gain is muted (0.0)
    const effectiveCulled = isCulled || isSoundBlocked;
    const attenuation = calculateAttenuation(distance, {
      ...this.attenuationConfig,
      maxRadius,
      hysteresisRadius,
      deltaX,
      deltaY,
      deltaZ,
      isCulled: effectiveCulled
    });

    peerData.gain = attenuation.gain;
    peerData.gainPercent = attenuation.gainPercent;
    peerData.decibels = attenuation.decibels;
    peerData.filterFreq = attenuation.filterFreq;
    peerData.pan = attenuation.pan;
    peerData.spatial3D = attenuation.spatial3D || peerData.spatial3D;
    peerData.isAudible = attenuation.isAudible;
    peerData.inHysteresis = attenuation.inHysteresis;
    peerData.model = attenuation.model;

    const audioCtx = this.getAudioContext();
    if (audioCtx) {
      const now = audioCtx.currentTime;
      const timeConstant = 0.035; // 35ms exponential smoothing prevents audio clicks/zipper noise

      // 1. Smoothly update volume drop-off gain in Web Audio API
      if (peerData.gainNode) {
        try {
          peerData.gainNode.gain.cancelScheduledValues(now);
          peerData.gainNode.gain.setTargetAtTime(attenuation.gain, now, timeConstant);
        } catch (e) {}
      }

      // 2. Smoothly update acoustic low-pass air absorption filter (with 3D rear pinna shadow)
      if (peerData.filterNode) {
        try {
          peerData.filterNode.frequency.cancelScheduledValues(now);
          peerData.filterNode.frequency.setTargetAtTime(attenuation.filterFreq, now, timeConstant);
        } catch (e) {}
      }

      // 3. Smoothly update 3D PannerNode position (HRTF Binaural 3D Audio)
      if (peerData.panner3DNode && deltaX !== null) {
        try {
          const scale = 0.02;
          const px = deltaX * scale;
          const py = (deltaY || 0) * scale;
          const pz = (deltaZ || 0) * scale;

          if (peerData.panner3DNode.positionX) {
            peerData.panner3DNode.positionX.cancelScheduledValues(now);
            peerData.panner3DNode.positionY.cancelScheduledValues(now);
            peerData.panner3DNode.positionZ.cancelScheduledValues(now);
            peerData.panner3DNode.positionX.setTargetAtTime(px, now, timeConstant);
            peerData.panner3DNode.positionY.setTargetAtTime(py, now, timeConstant);
            peerData.panner3DNode.positionZ.setTargetAtTime(pz, now, timeConstant);
          } else if (typeof peerData.panner3DNode.setPosition === 'function') {
            peerData.panner3DNode.setPosition(px, py, pz);
          }
        } catch (e) {}
      }

      // 4. Smoothly update binaural stereo separation pan (-1.0 left to +1.0 right)
      if (peerData.pannerNode && attenuation.pan !== null) {
        try {
          peerData.pannerNode.pan.cancelScheduledValues(now);
          peerData.pannerNode.pan.setTargetAtTime(attenuation.pan, now, timeConstant);
        } catch (e) {}
      }
    }

    return attenuation;
  }

  /**
   * Optimize WebRTC mesh topology based on avatar density
   * Prioritizes top K closest peers and flags excess peers as culled/standby.
   */
  updateMeshTopology(inRangePeers = []) {
    const sorted = [...inRangePeers].sort((a, b) => (a.distance || 0) - (b.distance || 0));
    const active = [];
    const culled = [];

    sorted.forEach((p, idx) => {
      const socketId = p.socketId || p.id;
      if (idx < this.maxMeshPeers) {
        active.push(socketId);
        this.culledPeers.delete(socketId);
      } else {
        culled.push(socketId);
        this.culledPeers.add(socketId);
      }
    });

    // Apply culled volume state
    this.culledPeers.forEach((socketId) => {
      const peerData = this.peers.get(socketId);
      if (peerData) {
        this.setPeerDistance(socketId, peerData.distance || 100, 100, null, true);
      }
    });

    return {
      maxMeshPeers: this.maxMeshPeers,
      activePeers: active,
      culledPeers: culled,
      activeCount: active.length,
      culledCount: culled.length
    };
  }

  /**
   * Retrieve WebRTC Mesh Optimization & Scaling Metrics
   */
  getMeshOptimizationStats() {
    return {
      maxMeshPeers: this.maxMeshPeers,
      activeMeshPeers: Math.max(0, this.peers.size - this.culledPeers.size),
      culledPeersCount: this.culledPeers.size,
      totalConnectedPeers: this.peers.size,
      opusBitrateKbps: 32,
      dtxEnabled: true,
      fecEnabled: true,
      spatialStereoPanning: true,
      hysteresisBufferPx: this.hysteresisRadius - 100,
      bandwidthSavingsEstimate: '~75%'
    };
  }

  /**
   * Read real-time WebRTC stats from RTCPeerConnection.getStats()
   */
  async getPeerStats(peerSocketId) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData || !peerData.pc) return null;

    try {
      const statsReport = await peerData.pc.getStats();
      let bytesReceived = 0;
      let packetsReceived = 0;
      let bytesSent = 0;
      let packetsSent = 0;
      let jitter = 0;
      let audioLevel = 0;

      statsReport.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          bytesReceived = report.bytesReceived || 0;
          packetsReceived = report.packetsReceived || 0;
          jitter = report.jitter ? Math.round(report.jitter * 1000) : 0;
          if (report.audioLevel !== undefined) audioLevel = report.audioLevel;
        }
        if (report.type === 'outbound-rtp' && report.kind === 'audio') {
          bytesSent = report.bytesSent || 0;
          packetsSent = report.packetsSent || 0;
        }
      });

      const updated = {
        connectionState: peerData.pc.connectionState,
        iceConnectionState: peerData.pc.iceConnectionState,
        signalingState: peerData.pc.signalingState,
        distance: Math.round(peerData.distance || 0),
        gainPercent: peerData.gainPercent !== undefined ? peerData.gainPercent : Math.round((peerData.gain || 0) * 100),
        gain: peerData.gain !== undefined ? peerData.gain : 0,
        decibels: peerData.decibels !== undefined ? peerData.decibels : -60,
        filterFreq: peerData.filterFreq || 20000,
        pan: peerData.pan !== undefined ? peerData.pan : 0,
        spatial3D: peerData.spatial3D || null,
        stereoSeparation: this.attenuationConfig.stereoSeparation || 1.0,
        panningMode: this.attenuationConfig.panningMode || 'hrtf',
        model: peerData.model || this.attenuationConfig.model,
        isAudible: peerData.isAudible !== undefined ? peerData.isAudible : (peerData.gain > 0),
        inHysteresis: !!peerData.inHysteresis,
        isCulled: !!peerData.isCulled,
        bytesReceived,
        packetsReceived,
        bytesSent,
        packetsSent,
        jitter,
        audioLevel
      };
      peerData.stats = updated;
      return updated;
    } catch (e) {
      return null;
    }
  }

  /**
   * Close a specific peer connection and cleanly tear down Web Audio API nodes
   */
  closePeerConnection(peerSocketId) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData) return;

    console.log(`[WebRTC P2P] Tearing down peer connection & Web Audio graph for: ${peerSocketId}`);

    // Disconnect Web Audio API node graph
    if (peerData.sourceNode) {
      try { peerData.sourceNode.disconnect(); } catch (e) {}
    }
    if (peerData.filterNode) {
      try { peerData.filterNode.disconnect(); } catch (e) {}
    }
    if (peerData.pannerNode) {
      try { peerData.pannerNode.disconnect(); } catch (e) {}
    }
    if (peerData.panner3DNode) {
      try { peerData.panner3DNode.disconnect(); } catch (e) {}
    }
    if (peerData.gainNode) {
      try { peerData.gainNode.disconnect(); } catch (e) {}
    }
    if (peerData.analyser) {
      try { peerData.analyser.disconnect(); } catch (e) {}
    }

    if (peerData.audioElement) {
      peerData.audioElement.pause();
      peerData.audioElement.srcObject = null;
    }

    if (peerData.pc) {
      peerData.pc.close();
    }

    this.peers.delete(peerSocketId);
    this.iceCandidateQueues.delete(peerSocketId);
    this.peerAudioLevels.delete(peerSocketId);
  }

  /**
   * Close all peer connections and release local microphone/synthetic streams
   */
  destroy() {
    this.peers.forEach((_, socketId) => {
      this.closePeerConnection(socketId);
    });

    this.stopSyntheticAudio(false);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.stopLoopbackTest();
  }

  /**
   * Calculate root-mean-square (RMS) volume / audio level for local audio (0.0 to 1.0)
   */
  getLocalAudioLevel() {
    if (!this.localAnalyser || this.isMicMuted) {
      this.localAudioLevel = 0;
      return 0;
    }

    const dataArray = new Uint8Array(this.localAnalyser.frequencyBinCount);
    this.localAnalyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / (dataArray.length * 255);
    this.localAudioLevel = this.localAudioLevel * 0.7 + avg * 0.3;
    return this.localAudioLevel;
  }

  /**
   * Calculate audio level for a remote peer (0.0 to 1.0)
   */
  getPeerAudioLevel(peerSocketId) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData || !peerData.analyser) return 0;

    const dataArray = new Uint8Array(peerData.analyser.frequencyBinCount);
    peerData.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / (dataArray.length * 255);
    const prev = this.peerAudioLevels.get(peerSocketId) || 0;
    const smoothed = prev * 0.7 + avg * 0.3;
    this.peerAudioLevels.set(peerSocketId, smoothed);
    return smoothed;
  }

  /**
   * Retrieve waveform bytes for local audio oscilloscope canvas rendering
   */
  getLocalWaveformData(outputArray) {
    if (!this.localAnalyser || this.isMicMuted) {
      outputArray.fill(128); // 128 is center baseline in 8-bit time-domain
      return;
    }
    this.localAnalyser.getByteTimeDomainData(outputArray);
  }

  /**
   * Retrieve frequency bytes for local audio equalizer canvas rendering
   */
  getLocalFrequencyData(outputArray) {
    if (!this.localAnalyser || this.isMicMuted) {
      outputArray.fill(0);
      return;
    }
    this.localAnalyser.getByteFrequencyData(outputArray);
  }

  /**
   * Retrieve waveform bytes for remote peer audio oscilloscope canvas rendering
   */
  getPeerWaveformData(peerSocketId, outputArray) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData || !peerData.analyser) {
      outputArray.fill(128);
      return;
    }
    peerData.analyser.getByteTimeDomainData(outputArray);
  }

  /**
   * Retrieve frequency bytes for remote peer audio equalizer canvas rendering
   */
  getPeerFrequencyData(peerSocketId, outputArray) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData || !peerData.analyser) {
      outputArray.fill(0);
      return;
    }
    peerData.analyser.getByteFrequencyData(outputArray);
  }

  /**
   * WebRTC Loopback Self-Test
   * Connects two local RTCPeerConnections (pc1 <-> pc2) in-browser using getUserMedia or synthetic tone
   */
  async startLoopbackTest() {
    if (!this.localStream) {
      await this.initMicrophone();
      if (!this.localStream) {
        this.startSyntheticAudio(440);
      }
    }

    try {
      this.stopLoopbackTest();

      const pc1 = new RTCPeerConnection(RTC_CONFIG);
      const pc2 = new RTCPeerConnection(RTC_CONFIG);

      pc1.onicecandidate = (e) => e.candidate && pc2.addIceCandidate(e.candidate);
      pc2.onicecandidate = (e) => e.candidate && pc1.addIceCandidate(e.candidate);

      const loopbackAudio = new Audio();
      loopbackAudio.autoplay = true;
      loopbackAudio.playsInline = true;
      loopbackAudio.volume = 0.5;

      pc2.ontrack = (event) => {
        loopbackAudio.srcObject = event.streams[0];
      };

      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((track) => {
          pc1.addTrack(track, this.localStream);
        });
      }

      const offer = await pc1.createOffer({ offerToReceiveAudio: true });
      await pc1.setLocalDescription(offer);
      await pc2.setRemoteDescription(offer);

      const answer = await pc2.createAnswer();
      await pc2.setLocalDescription(answer);
      await pc1.setRemoteDescription(answer);

      this.loopbackSession = { pc1, pc2, audio: loopbackAudio };
      this.showToast('WebRTC Loopback audio active! Speak to hear your microphone echo.', 'info');
      return true;
    } catch (err) {
      console.error('[WebRTC Audio] Loopback test error:', err);
      this.showToast(`Loopback test failed: ${err.message}`, 'error');
      return false;
    }
  }

  stopLoopbackTest() {
    if (this.loopbackSession) {
      if (this.loopbackSession.audio) {
        this.loopbackSession.audio.pause();
        this.loopbackSession.audio.srcObject = null;
      }
      this.loopbackSession.pc1.close();
      this.loopbackSession.pc2.close();
      this.loopbackSession = null;
      this.showToast('WebRTC Loopback audio stopped.', 'info');
    }
  }
}
