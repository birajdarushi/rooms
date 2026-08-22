import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { AudioTrackInfo, PlayerStatus } from '../types';

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  private currentTrack: AudioTrackInfo | null = null;
  private isPlaying: boolean = false;
  private soundObject: Audio.Sound | null = null;
  private htmlAudio: HTMLAudioElement | null = null;

  private onTrackEndedCallback: (() => void) | null = null;
  private onStatusChangeCallback: ((status: PlayerStatus) => void) | null = null;

  private isWeb: boolean = Platform.OS === 'web';
  private isConfigured: boolean = false;

  private constructor() {
    this.initAudioMode();
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private async initAudioMode() {
    if (this.isWeb || this.isConfigured) return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
      this.isConfigured = true;
    } catch (e) {
      console.warn('[AudioEngine] Failed to set audio mode:', e);
    }
  }

  public setOnTrackEnded(callback: () => void) {
    this.onTrackEndedCallback = callback;
  }

  public setOnStatusChange(callback: (status: PlayerStatus) => void) {
    this.onStatusChangeCallback = callback;
  }

  /**
   * Pre-load and warm up audio buffers without resetting the element if already active.
   */
  public async loadTrack(track: AudioTrackInfo, autoPlay: boolean = false, initialPosition: number = 0) {
    const { getApiBaseUrl } = require('../api/client');
    const base = getApiBaseUrl();

    let normalizedUrl = track.url;
    if (base.startsWith('https://')) {
      normalizedUrl = normalizedUrl.replace(/^https?:\/\/[^/]+/, base);
    } else {
      normalizedUrl = normalizedUrl
        .replace(/https?:\/\/localhost:\d+/, base)
        .replace(/https?:\/\/127\.0\.0\.1:\d+/, base)
        .replace(/https?:\/\/172\.\d+\.\d+\.\d+:\d+/, base)
        .replace(/https?:\/\/192\.168\.\d+\.\d+:\d+/, base);
    }

    const normalizedTrack = { ...track, url: normalizedUrl };
    this.currentTrack = normalizedTrack;

    if (this.isWeb) {
      // ⚡ REUSE WARM AUDIO ELEMENT: If URL matches, do NOT destroy & recreate the audio pipeline!
      if (this.htmlAudio && this.htmlAudio.src === normalizedUrl) {
        if (initialPosition > 0 && Math.abs((this.htmlAudio.currentTime || 0) - initialPosition) > 0.2) {
          this.htmlAudio.currentTime = initialPosition;
        }
        if (autoPlay && this.htmlAudio.paused) {
          try {
            await this.htmlAudio.play();
            this.isPlaying = true;
          } catch (e) {
            console.warn('[AudioEngine] Play on existing element error:', e);
          }
        }
        return;
      }

      // Cleanup prior instance if switching tracks
      if (this.htmlAudio) {
        this.htmlAudio.pause();
        this.htmlAudio.src = '';
      }

      this.htmlAudio = new (window as any).Audio(normalizedUrl);
      this.htmlAudio!.crossOrigin = 'anonymous';
      this.htmlAudio!.preload = 'auto';
      this.htmlAudio!.volume = 1.0;
      (this.htmlAudio as any).preservesPitch = true;
      (this.htmlAudio as any).mozPreservesPitch = true;
      (this.htmlAudio as any).webkitPreservesPitch = true;

      // Start preloading frames immediately
      this.htmlAudio!.load();

      this.htmlAudio!.onended = () => {
        this.isPlaying = false;
        this.stopProgressTicker();
        this.notifyStatus(0);
        if (this.onTrackEndedCallback) {
          this.onTrackEndedCallback();
        }
      };

      this.htmlAudio!.onplay = () => {
        this.isPlaying = true;
        this.startProgressTicker();
        this.notifyStatus(this.htmlAudio?.currentTime || 0);
      };

      this.htmlAudio!.onpause = () => {
        this.isPlaying = false;
        this.stopProgressTicker();
        this.notifyStatus(this.htmlAudio?.currentTime || 0);
      };

      this.htmlAudio!.ontimeupdate = () => {
        if (this.isPlaying) {
          this.notifyStatus(this.htmlAudio?.currentTime || 0);
        }
      };

      this.htmlAudio!.onerror = (err) => {
        console.error('[AudioEngine] HTML Audio playback error for URL:', normalizedUrl, err);
      };

      if (initialPosition > 0) {
        if (this.htmlAudio!.readyState >= 1) {
          this.htmlAudio!.currentTime = initialPosition;
        } else {
          this.htmlAudio!.addEventListener('loadedmetadata', () => {
            try {
              if (this.htmlAudio) {
                this.htmlAudio.currentTime = initialPosition;
              }
            } catch (e) {}
          }, { once: true });
        }
      }

      if (autoPlay) {
        try {
          await this.htmlAudio!.play();
          this.isPlaying = true;
          this.startProgressTicker();
        } catch (e) {
          console.warn('[AudioEngine] Autoplay error:', e);
        }
      }
      return;
    }

    // Native Expo Audio Implementation
    try {
      if (this.soundObject) {
        await this.soundObject.unloadAsync();
        this.soundObject = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: normalizedUrl },
        {
          shouldPlay: autoPlay,
          positionMillis: Math.max(0, initialPosition * 1000),
          progressUpdateIntervalMillis: 500,
        },
        this.onPlaybackStatusUpdate
      );

      this.soundObject = sound;
    } catch (e) {
      console.error('[AudioEngine] Error loading sound:', e);
    }
  }

  private onPlaybackStatusUpdate = (status: any) => {
    if (!status.isLoaded) return;

    this.isPlaying = status.isPlaying;

    if (status.didJustFinish) {
      this.isPlaying = false;
      if (this.onTrackEndedCallback) {
        this.onTrackEndedCallback();
      }
    }

    const posSec = (status.positionMillis || 0) / 1000;
    this.notifyStatus(posSec);
  };

  private notifyStatus(position: number) {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback({
        isPlaying: this.isPlaying,
        position,
        duration: this.currentTrack?.duration || 0,
        isLoading: false,
        isBuffering: false,
      });
    }
  }

  private tickerInterval: any = null;

  private startProgressTicker() {
    this.stopProgressTicker();
    this.tickerInterval = setInterval(() => {
      if (this.isPlaying && this.isWeb && this.htmlAudio) {
        const current = this.htmlAudio.currentTime || 0;
        this.notifyStatus(current);
      }
    }, 150);
  }

  private stopProgressTicker() {
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }
  }

  public async play() {
    this.isPlaying = true;
    this.startProgressTicker();
    if (this.isWeb && this.htmlAudio) {
      try {
        if (this.htmlAudio.paused) {
          await this.htmlAudio.play();
        }
      } catch (e) {
        console.warn('[AudioEngine] Web play error:', e);
      }
      return;
    }

    if (this.soundObject) {
      await this.soundObject.playAsync();
    }
  }

  public async pause() {
    this.isPlaying = false;
    this.stopProgressTicker();
    if (this.isWeb && this.htmlAudio) {
      this.htmlAudio.pause();
      this.notifyStatus(this.htmlAudio.currentTime || 0);
      return;
    }

    if (this.soundObject) {
      await this.soundObject.pauseAsync();
      const status = await this.soundObject.getStatusAsync();
      if (status.isLoaded) {
        this.notifyStatus((status.positionMillis || 0) / 1000);
      }
    }
  }

  public async seekTo(seconds: number) {
    const safeSec = Math.max(0, seconds);

    if (this.isWeb && this.htmlAudio) {
      if (this.htmlAudio.readyState >= 1) {
        if (Math.abs((this.htmlAudio.currentTime || 0) - safeSec) > 0.04) {
          this.htmlAudio.currentTime = safeSec;
        }
      } else {
        this.htmlAudio.addEventListener(
          'loadedmetadata',
          () => {
            try {
              if (this.htmlAudio) {
                this.htmlAudio.currentTime = safeSec;
              }
            } catch (e) {}
          },
          { once: true }
        );
      }
      this.notifyStatus(safeSec);
      if (this.isPlaying && this.htmlAudio.paused) {
        try {
          await this.htmlAudio.play();
        } catch (e) {}
      }
      return;
    }

    if (this.soundObject) {
      await this.soundObject.setPositionAsync(safeSec * 1000);
      this.notifyStatus(safeSec);
    }
  }

  public async setRate(rate: number) {
    const clampedRate = Math.max(0.85, Math.min(1.15, rate));
    if (this.isWeb && this.htmlAudio) {
      (this.htmlAudio as any).preservesPitch = true;
      if (Math.abs(this.htmlAudio.playbackRate - clampedRate) > 0.005) {
        this.htmlAudio.playbackRate = clampedRate;
      }
      return;
    }

    if (this.soundObject) {
      try {
        await this.soundObject.setRateAsync(clampedRate, true);
      } catch (e) {}
    }
  }

  public async getPosition(): Promise<number> {
    if (this.isWeb && this.htmlAudio) {
      return this.htmlAudio.currentTime || 0;
    }

    if (this.soundObject) {
      const status = await this.soundObject.getStatusAsync();
      if (status.isLoaded) {
        return (status.positionMillis || 0) / 1000;
      }
    }
    return 0;
  }

  public async getDuration(): Promise<number> {
    if (this.currentTrack?.duration) return this.currentTrack.duration;

    if (this.isWeb && this.htmlAudio && this.htmlAudio.duration) {
      return this.htmlAudio.duration;
    }

    if (this.soundObject) {
      const status = await this.soundObject.getStatusAsync();
      if (status.isLoaded && status.durationMillis) {
        return status.durationMillis / 1000;
      }
    }
    return 0;
  }

  public async setVolume(volume: number) {
    const vol = Math.max(0, Math.min(1, volume));
    if (this.isWeb && this.htmlAudio) {
      this.htmlAudio.volume = vol;
      return;
    }

    if (this.soundObject) {
      await this.soundObject.setVolumeAsync(vol);
    }
  }

  public async unload() {
    this.isPlaying = false;
    if (this.isWeb && this.htmlAudio) {
      this.htmlAudio.pause();
      this.htmlAudio.src = '';
      this.htmlAudio = null;
    }

    if (this.soundObject) {
      try {
        await this.soundObject.unloadAsync();
      } catch (e) {}
      this.soundObject = null;
    }
    this.currentTrack = null;
  }

  public getCurrentTrack(): AudioTrackInfo | null {
    return this.currentTrack;
  }
}

export const audioEngine = AudioEngine.getInstance();
