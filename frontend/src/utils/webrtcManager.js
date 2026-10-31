/**
 * ProxiSpeak WebRTC Audio Manager
 * Infotact Solutions - Geospatial Proximity Audio Ecosystem
 *
 * Implements standard WebRTC peer-to-peer audio connections using the browser's
 * navigator.mediaDevices.getUserMedia, Web Audio API synthetic audio test streams,
 * and Web Audio API for spatial distance attenuation and Canvas API visualization.
 */

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

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

    // Loopback test session
    this.loopbackSession = null;
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
      gainNode: null,
      analyser: null,
      connectionState: 'new',
      distance: 50,
      gain: 1.0,
      stats: { bytesReceived: 0, packetsReceived: 0, bytesSent: 0, packetsSent: 0, audioLevel: 0, jitter: 0 }
    });

    return pc;
  }

  /**
   * Setup remote audio stream playback, Web Audio gain attenuation, and frequency analyser
   */
  setupRemoteAudioStream(peerSocketId, remoteStream) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData) return;

    peerData.stream = remoteStream;

    // 1. Dedicated HTML5 Audio element for reliable browser audio playback
    const audioElement = new Audio();
    audioElement.srcObject = remoteStream;
    audioElement.autoplay = true;
    audioElement.playsInline = true;
    audioElement.volume = peerData.gain !== undefined ? peerData.gain : 0.8;

    // Handle browser autoplay policy
    audioElement.play().catch((err) => {
      console.log(`[WebRTC Audio] Remote audio autoplay pending user gesture:`, err);
    });

    peerData.audioElement = audioElement;

    // 2. Setup Web Audio API node graph for distance attenuation and Canvas visualizer
    try {
      const audioCtx = this.getAudioContext();
      if (audioCtx) {
        const source = audioCtx.createMediaStreamSource(remoteStream);
        const gainNode = audioCtx.createGain();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.6;

        source.connect(gainNode);
        gainNode.connect(analyser);

        peerData.gainNode = gainNode;
        peerData.analyser = analyser;
      }
    } catch (err) {
      console.warn('[WebRTC Audio] Web Audio graph setup error for peer:', err);
    }
  }

  /**
   * Initiate a WebRTC offer for a target peer
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

    await pc.setLocalDescription(offer);
    console.log(`[WebRTC P2P] Created and set local offer for peer: ${peerSocketId}`);
    return offer;
  }

  /**
   * Handle an incoming WebRTC offer from a caller
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
    await pc.setLocalDescription(answer);
    console.log(`[WebRTC P2P] Created and set local answer for caller: ${callerSocketId}`);
    return answer;
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
   * Dynamically adjust remote peer audio volume based on Euclidean distance on canvas
   * Distance <= 100px: Gain attenuates smoothly between 10% and 100%
   * Distance > 100px: Gain is 0% (silence)
   */
  setPeerDistance(peerSocketId, distance, maxRadius = 100) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData) return;

    peerData.distance = distance;

    let gain = 0;
    if (distance <= maxRadius) {
      // Smooth linear attenuation: 1.0 (at 0px) down to 0.1 (at 100px)
      gain = Math.max(0.1, 1 - (distance / maxRadius) * 0.9);
    }

    peerData.gain = gain;

    // Apply to HTML5 audio element
    if (peerData.audioElement) {
      peerData.audioElement.volume = gain;
    }

    // Apply to Web Audio API GainNode if present
    if (peerData.gainNode && this.audioContext) {
      try {
        peerData.gainNode.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.05);
      } catch (e) {}
    }
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
        gainPercent: Math.round((peerData.gain || 0) * 100),
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
   * Close a specific peer connection and tear down audio elements
   */
  closePeerConnection(peerSocketId) {
    const peerData = this.peers.get(peerSocketId);
    if (!peerData) return;

    console.log(`[WebRTC P2P] Tearing down peer connection for: ${peerSocketId}`);

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
