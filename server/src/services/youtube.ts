import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { YouTubeVideoInfo } from '../../../shared';

const execFileAsync = promisify(execFile);

// Look for yt-dlp in common macOS and Linux binary locations
const POSSIBLE_YTDLP_PATHS = [
  '/opt/homebrew/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  '/usr/bin/yt-dlp',
  'yt-dlp',
];

function getYtDlpBinary(): string {
  for (const binPath of POSSIBLE_YTDLP_PATHS) {
    if (binPath === 'yt-dlp') return binPath;
    if (fs.existsSync(binPath)) return binPath;
  }
  return 'yt-dlp';
}

export function isValidYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const ytRegex = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[\w-]{11}([?&].*)?$/i;
  return ytRegex.test(url.trim());
}

export function extractVideoId(url: string): string | null {
  const match = url.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/i);
  return match ? match[1] : null;
}

export class YouTubeService {
  private ytDlpPath: string;

  constructor() {
    this.ytDlpPath = getYtDlpBinary();
  }

  /**
   * Fast metadata extraction without downloading media bytes.
   */
  public async getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
    if (!isValidYouTubeUrl(url)) {
      throw new Error('Invalid YouTube URL provided.');
    }

    const binary = this.ytDlpPath;
    const args = ['--dump-single-json', '--no-playlist', '--no-warnings', url.trim()];

    try {
      const { stdout } = await execFileAsync(binary, args, { maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(stdout);

      const title = data.title || data.fulltitle || 'YouTube Track';
      const artist = data.artist || data.uploader || data.channel || 'YouTube';
      const duration = Math.round(data.duration || 0);
      const thumbnail = data.thumbnail || (Array.isArray(data.thumbnails) && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1].url : '');

      return {
        title,
        artist,
        duration,
        thumbnail,
        youtubeUrl: url.trim(),
      };
    } catch (err: any) {
      console.error('[YouTubeService] Error getting video info:', err.message || err);
      throw new Error(`Failed to fetch YouTube metadata: ${err.message || 'Unknown error'}`);
    }
  }

  /**
   * Downloads high-quality audio stream directly into room's storage directory.
   */
  public async downloadAudioTrack(params: {
    roomId: string;
    url: string;
    uploadsDir: string;
    customTitle?: string;
    customArtist?: string;
  }): Promise<{
    storageKey: string;
    storageUrl: string;
    title: string;
    artist: string;
    duration: number;
    artworkUrl: string;
  }> {
    const { roomId, url, uploadsDir, customTitle, customArtist } = params;

    const info = await this.getVideoInfo(url);
    const videoId = extractVideoId(url) || 'track';
    const finalTitle = customTitle?.trim() || info.title;
    const finalArtist = customArtist?.trim() || info.artist;
    const duration = info.duration;
    const artworkUrl = info.thumbnail;

    const roomDir = path.join(uploadsDir, 'rooms', roomId);
    if (!fs.existsSync(roomDir)) {
      fs.mkdirSync(roomDir, { recursive: true });
    }

    const timestamp = Date.now();
    const fileName = `${timestamp}_${videoId}.mp3`;
    const targetFilePath = path.join(roomDir, fileName);
    const outputTemplate = path.join(roomDir, `${timestamp}_${videoId}.%(ext)s`);

    const binary = this.ytDlpPath;
    const args = [
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '--no-playlist',
      '--no-warnings',
      '-o',
      outputTemplate,
      url.trim(),
    ];

    try {
      console.log(`[YouTubeService] 📥 Extracting YouTube audio for room ${roomId}: "${finalTitle}"...`);
      await execFileAsync(binary, args, { maxBuffer: 10 * 1024 * 1024 });

      if (!fs.existsSync(targetFilePath)) {
        throw new Error('Downloaded audio file not found at expected location.');
      }

      const storageKey = `rooms/${roomId}/${fileName}`;
      const storageUrl = `/uploads/${storageKey}`;

      console.log(`[YouTubeService] ✅ Audio successfully cached to ${targetFilePath} (${duration}s)`);

      return {
        storageKey,
        storageUrl,
        title: finalTitle,
        artist: finalArtist,
        duration,
        artworkUrl,
      };
    } catch (err: any) {
      console.error('[YouTubeService] Error downloading audio track:', err.message || err);
      throw new Error(`Failed to download YouTube audio: ${err.message || 'Unknown error'}`);
    }
  }
}

export const youtubeService = new YouTubeService();
