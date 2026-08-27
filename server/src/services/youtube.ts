import { YouTubeVideoInfo } from '../shared';
import { extractAudioUrl } from './cobalt';

export function isValidYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const ytRegex = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[\w-]{11}([?&].*)?$/i;
  return ytRegex.test(url.trim());
}

export function extractVideoId(url: string): string | null {
  const match = url.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/i);
  return match ? match[1] : null;
}

export class YouTubeService {
  /**
   * Fast metadata extraction via YouTube oEmbed (no binary needed — works on Vercel).
   */
  public async getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
    if (!isValidYouTubeUrl(url)) {
      throw new Error('Invalid YouTube URL provided.');
    }

    const videoId = extractVideoId(url) || 'track';

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data: any = await res.json();
        return {
          title: data.title || 'YouTube Track',
          artist: data.author_name || 'YouTube Channel',
          duration: 180,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          youtubeUrl: url.trim(),
        };
      }
    } catch (e: any) {
      console.error('[YouTubeService] oEmbed error:', e?.message || e);
    }

    return {
      title: 'YouTube Track',
      artist: 'YouTube',
      duration: 180,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      youtubeUrl: url.trim(),
    };
  }

  /**
   * Extracts a streamable audio URL via cobalt.tools.
   * No file download — returns a temporary CDN stream URL directly.
   */
  public async getStreamUrl(params: {
    roomId: string;
    url: string;
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
    const { roomId, url, customTitle, customArtist } = params;

    const info = await this.getVideoInfo(url);
    const videoId = extractVideoId(url) || 'track';
    const finalTitle = customTitle?.trim() || info.title;
    const finalArtist = customArtist?.trim() || info.artist;
    const duration = info.duration;
    const artworkUrl = info.thumbnail;

    let streamUrl = url.trim();

    const EXTRACTOR_URL = process.env.EXTRACTOR_URL;
    if (EXTRACTOR_URL) {
      try {
        console.log(`[YouTubeService] Calling Cloud Extractor for: "${finalTitle}"`);
        const res = await fetch(`${EXTRACTOR_URL}/extract/youtube`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
          const data: any = await res.json();
          if (data.streamUrl) {
            streamUrl = data.streamUrl;
            console.log(`[YouTubeService] ✅ Audio stream resolved from Cloud Extractor!`);
          }
        }
      } catch (err: any) {
        console.warn(`[YouTubeService] Extractor error, falling back:`, err.message);
      }
    }

    return {
      storageKey: `youtube/rooms/${roomId}/${videoId}`,
      storageUrl: streamUrl,
      title: finalTitle,
      artist: finalArtist,
      duration,
      artworkUrl,
    };
  }
}

export const youtubeService = new YouTubeService();
