import { Platform } from 'react-native';
import { SocketEvents, StreamStartPayload, StreamChunkPayload } from '../types';

export class LiveAudioStreamer {
  private static instance: LiveAudioStreamer;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private isBroadcasting: boolean = false;
  private volumeCallback: ((level: number) => void) | null = null;
  private mediaRecorder: MediaRecorder | null = null;

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
   * 1. Start capturing live system/tab audio from the browser
   */
  public async startSystemAudioBroadcast(roomId: string, socket: any): Promise<boolean> {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('System audio capture is only supported on Web browsers (Chrome, Edge, Brave, Opera).');
    }

    try {
      // Prompt user to capture screen with system audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        // User didn't check 'Share audio'
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('No audio track detected. Please make sure to check "Also share audio" in the popup.');
      }

      this.mediaStream = stream;
      this.isBroadcasting = true;

      // Handle user clicking "Stop Sharing" on browser banner
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          this.stopBroadcast(roomId, socket);
        };
      });

      // Initialize Web Audio Analyzer for Live VU Meter
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(stream);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkLevel = () => {
          if (!this.isBroadcasting) return;
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
      }

      // Notify server that stream started
      socket.emit(SocketEvents.STREAM_START, {
        roomId,
        title: 'Live System Audio Broadcast',
      });

      // Stream audio chunks via MediaRecorder for low-latency chunk relay
      if (typeof MediaRecorder !== 'undefined') {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

        const audioOnlyStream = new MediaStream(audioTracks);
        this.mediaRecorder = new MediaRecorder(audioOnlyStream, {
          mimeType,
          audioBitsPerSecond: 128000,
        });

        this.mediaRecorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0 && this.isBroadcasting) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result as string;
              socket.emit(SocketEvents.STREAM_CHUNK, {
                roomId,
                chunk: base64data,
                timestamp: Date.now(),
              });
            };
            reader.readAsDataURL(e.data);
          }
        };

        // Emit slice every 250ms for low-latency transmission
        this.mediaRecorder.start(250);
      }

      console.log('[LiveAudioStreamer] 🎙️ Live System Audio Broadcast started!');
      return true;
    } catch (err: any) {
      console.error('[LiveAudioStreamer] Error capturing audio:', err);
      this.isBroadcasting = false;
      throw err;
    }
  }

  /**
   * 2. Stop Live Audio Broadcast
   */
  public stopBroadcast(roomId: string, socket: any) {
    this.isBroadcasting = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
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
