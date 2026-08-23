import { Platform } from 'react-native';
import { SocketEvents, StreamStartPayload } from '../types';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class LiveAudioStreamer {
  private static instance: LiveAudioStreamer;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private isBroadcasting: boolean = false;
  private isListeningToStream: boolean = false;
  private volumeCallback: ((level: number) => void) | null = null;

  // Host PeerConnections to each listener
  private hostPeerConnections: Map<string, RTCPeerConnection> = new Map();
  private mediaRecorder: any = null;

  // Listener PeerConnection to the host
  private listenerPeerConnection: RTCPeerConnection | null = null;
  private listenerAudioElement: HTMLAudioElement | null = null;

  public static getInstance(): LiveAudioStreamer {
    if (!LiveAudioStreamer.instance) {
      LiveAudioStreamer.instance = new LiveAudioStreamer();
    }
    return LiveAudioStreamer.instance;
  }

  public setOnVolumeLevel(callback: (level: number) => void) {
    this.volumeCallback = callback;
  }

  /**
   * 1. HOST: Start capturing live system/microphone audio and setup WebRTC broadcaster
   */
  public async startSystemAudioBroadcast(roomId: string, socket: any): Promise<boolean> {
    try {
      let stream: MediaStream | null = null;

      // 1. Try Desktop Tab/System Audio Capture if supported
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
            } as any,
          });
        } catch (displayErr: any) {
          console.warn('[LiveAudioStreamer] getDisplayMedia fallback to getUserMedia:', displayErr);
        }
      }

      // 2. Fallback to Direct High-Definition Audio Capture (Works on Mobile + Desktop)
      if (!stream || stream.getAudioTracks().length === 0) {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
              sampleRate: 44100,
            } as any,
          });
        }
      }

      if (!stream) {
        throw new Error('Live audio capture is not supported or permission was denied on this device.');
      }

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('No audio track detected. Please allow audio access in your browser or device permissions.');
      }

      this.mediaStream = stream;
      this.isBroadcasting = true;
      this.hostPeerConnections.clear();

      // When stream ends
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          this.stopBroadcast(roomId, socket);
        };
      });

      // Initialize Web Audio Analyzer for Live VU Meter
      this.initAudioAnalyzer(stream);

      // Bind Host WebRTC socket signaling
      this.bindHostSocketSignaling(roomId, socket, stream);

      // Stream raw 16-bit PCM stereo (44.1kHz) directly to server for instant zero-error MP3 transcode
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const pcmCtx = new AudioCtx({ sampleRate: 44100 });
          const pcmSource = pcmCtx.createMediaStreamSource(stream);
          const pcmProcessor = pcmCtx.createScriptProcessor(4096, 2, 2);

          pcmSource.connect(pcmProcessor);
          pcmProcessor.connect(pcmCtx.destination);

          pcmProcessor.onaudioprocess = (e) => {
            if (!this.isBroadcasting) return;
            const left = e.inputBuffer.getChannelData(0);
            const right = e.inputBuffer.getChannelData(1);

            const buffer = new ArrayBuffer(left.length * 4);
            const view = new DataView(buffer);
            for (let i = 0; i < left.length; i++) {
              const sLeft = Math.max(-1, Math.min(1, left[i]));
              const sRight = Math.max(-1, Math.min(1, right[i]));
              view.setInt16(i * 4, sLeft < 0 ? sLeft * 0x8000 : sLeft * 0x7FFF, true);
              view.setInt16(i * 4 + 2, sRight < 0 ? sRight * 0x8000 : sRight * 0x7FFF, true);
            }

            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64Chunk = btoa(binary);

            socket.emit(SocketEvents.STREAM_CHUNK, {
              roomId,
              chunk: base64Chunk,
              timestamp: Date.now(),
            });
          };

          this.pcmAudioContext = pcmCtx;
          this.pcmProcessorNode = pcmProcessor;
        }
      } catch (pcmErr) {
        console.warn('[LiveAudioStreamer] PCM Streamer init error:', pcmErr);
      }

      // Notify room server that live broadcast started
      socket.emit(SocketEvents.STREAM_START, {
        roomId,
        title: 'Live Audio Broadcast',
      });

      console.log('[LiveAudioStreamer] 🎙️ Live Audio Broadcast active on Mobile & Desktop!');
      return true;
    } catch (err: any) {
      console.error('[LiveAudioStreamer] Error capturing audio:', err);
      this.isBroadcasting = false;
      throw err;
    }
  }

  /**
   * Bind Host WebRTC Signaling (creates offer whenever a listener joins)
   */
  private bindHostSocketSignaling(roomId: string, socket: any, stream: MediaStream) {
    // When a listener joins the live stream, host creates an offer for them
    socket.off(SocketEvents.STREAM_LISTENER_JOINED);
    socket.on(SocketEvents.STREAM_LISTENER_JOINED, async (payload: { listenerSocketId: string }) => {
      const { listenerSocketId } = payload;
      if (!this.isBroadcasting || !listenerSocketId) return;

      console.log(`[LiveAudioStreamer] 🤝 Creating WebRTC Offer for listener: ${listenerSocketId}`);

      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        this.hostPeerConnections.set(listenerSocketId, pc);

        // Add host audio track to peer connection
        stream.getAudioTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Exchange ICE Candidates with this listener
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit(SocketEvents.STREAM_ICE_CANDIDATE, {
              roomId,
              targetSocketId: listenerSocketId,
              candidate: event.candidate,
            });
          }
        };

        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });

        await pc.setLocalDescription(offer);

        socket.emit(SocketEvents.STREAM_OFFER, {
          roomId,
          targetSocketId: listenerSocketId,
          sdp: offer,
        });
      } catch (e) {
        console.error('[LiveAudioStreamer] Error creating offer for listener:', e);
      }
    });

    // When listener sends back WebRTC Answer
    socket.off(SocketEvents.STREAM_ANSWER);
    socket.on(SocketEvents.STREAM_ANSWER, async (payload: { listenerSocketId: string; sdp: any }) => {
      const { listenerSocketId, sdp } = payload;
      const pc = this.hostPeerConnections.get(listenerSocketId);
      if (pc && sdp) {
        try {
          console.log(`[LiveAudioStreamer] ✅ Received SDP Answer from listener ${listenerSocketId}`);
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (e) {
          console.error('[LiveAudioStreamer] Error setting remote description from listener:', e);
        }
      }
    });

    // When listener sends ICE Candidate
    socket.off(SocketEvents.STREAM_ICE_CANDIDATE);
    socket.on(SocketEvents.STREAM_ICE_CANDIDATE, async (payload: { fromSocketId: string; candidate: any }) => {
      const { fromSocketId, candidate } = payload;
      const pc = this.hostPeerConnections.get(fromSocketId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {}
      }
    });
  }

  /**
   * 2. LISTENER: Connect to Host's Live WebRTC Audio Stream
   */
  public joinStreamAsListener(roomId: string, socket: any) {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !socket) return;

    this.isListeningToStream = true;
    console.log(`[LiveAudioStreamer] 🎧 Requesting to join live stream in room ${roomId}`);

    // Clean up existing listener peer connection
    if (this.listenerPeerConnection) {
      this.listenerPeerConnection.close();
      this.listenerPeerConnection = null;
    }

    // Bind listener socket handlers
    socket.off(SocketEvents.STREAM_OFFER);
    socket.on(SocketEvents.STREAM_OFFER, async (payload: { broadcasterSocketId: string; sdp: any }) => {
      const { broadcasterSocketId, sdp } = payload;
      console.log(`[LiveAudioStreamer] 📥 Received WebRTC Offer from host ${broadcasterSocketId}`);

      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        this.listenerPeerConnection = pc;

        // When incoming audio stream arrives from host!
        pc.ontrack = (event) => {
          console.log('[LiveAudioStreamer] 🔊 Live Audio Track arrived from host!');
          if (event.streams && event.streams[0]) {
            this.playIncomingAudioStream(event.streams[0]);
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit(SocketEvents.STREAM_ICE_CANDIDATE, {
              roomId,
              targetSocketId: broadcasterSocketId,
              candidate: event.candidate,
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit(SocketEvents.STREAM_ANSWER, {
          roomId,
          targetSocketId: broadcasterSocketId,
          sdp: answer,
        });
      } catch (e) {
        console.error('[LiveAudioStreamer] Listener error negotiating WebRTC stream:', e);
      }
    });

    socket.off(SocketEvents.STREAM_ICE_CANDIDATE);
    socket.on(SocketEvents.STREAM_ICE_CANDIDATE, async (payload: { candidate: any }) => {
      if (this.listenerPeerConnection && payload.candidate) {
        try {
          await this.listenerPeerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {}
      }
    });

    // Request stream from host
    socket.emit(SocketEvents.STREAM_JOIN, { roomId });
  }

  /**
   * Play incoming live audio stream on listener device
   */
  private playIncomingAudioStream(stream: MediaStream) {
    if (typeof document === 'undefined') return;

    try {
      let audioEl = document.getElementById('room-live-stream-audio') as HTMLAudioElement;
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = 'room-live-stream-audio';
        audioEl.autoplay = true;
        (audioEl as any).playsInline = true;
        (audioEl as any).webkitPlaysInline = true;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
      }

      audioEl.srcObject = stream;
      audioEl.muted = false;
      audioEl.volume = 1.0;
      
      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[LiveAudioStreamer] Mobile autoplay policy: tap Tune In to unmute:', err);
        });
      }

      this.listenerAudioElement = audioEl;
    } catch (e) {
      console.error('[LiveAudioStreamer] Error playing incoming audio:', e);
    }
  }

  /**
   * Unmute / unlock audio on mobile device after user tap
   */
  public unmuteLiveAudio() {
    try {
      if (this.listenerAudioElement) {
        this.listenerAudioElement.muted = false;
        this.listenerAudioElement.volume = 1.0;
        this.listenerAudioElement.play().catch(console.warn);
      }
    } catch (e) {
      console.warn('[LiveAudioStreamer] Unmute error:', e);
    }
  }

  /**
   * VU Meter analyzer
   */
  private initAudioAnalyzer(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkLevel = () => {
        if (!this.isBroadcasting && !this.isListeningToStream) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const level = Math.min(1.0, avg / 128);
        if (this.volumeCallback) {
          this.volumeCallback(level);
        }
        requestAnimationFrame(checkLevel);
      };
      requestAnimationFrame(checkLevel);
    } catch (e) {
      console.warn('[LiveAudioStreamer] Analyzer init error:', e);
    }
  }

  /**
   * Stop broadcast
   */
  public stopBroadcast(roomId: string, socket: any) {
    this.isBroadcasting = false;
    this.isListeningToStream = false;

    // Close all host peer connections
    for (const [id, pc] of this.hostPeerConnections.entries()) {
      try {
        pc.close();
      } catch (e) {}
    }
    this.hostPeerConnections.clear();

    if (this.listenerPeerConnection) {
      try {
        this.listenerPeerConnection.close();
      } catch (e) {}
      this.listenerPeerConnection = null;
    }

    if (this.listenerAudioElement) {
      try {
        this.listenerAudioElement.pause();
        this.listenerAudioElement.srcObject = null;
      } catch (e) {}
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.pcmProcessorNode) {
      try {
        this.pcmProcessorNode.disconnect();
      } catch (e) {}
      this.pcmProcessorNode = null;
    }

    if (this.pcmAudioContext) {
      this.pcmAudioContext.close().catch(() => {});
      this.pcmAudioContext = null;
    }

    if (socket) {
      socket.emit(SocketEvents.STREAM_STOP, { roomId });
    }

    if (this.volumeCallback) {
      this.volumeCallback(0);
    }

    console.log('[LiveAudioStreamer] 🛑 Live System Audio Broadcast stopped.');
  }

  public getIsBroadcasting(): boolean {
    return this.isBroadcasting;
  }
}

export const liveAudioStreamer = LiveAudioStreamer.getInstance();
