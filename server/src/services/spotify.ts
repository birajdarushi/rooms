import { SpotifyTrackInfo } from '../shared';
import { extractAudioUrl } from './cobalt';

export function isValidSpotifyUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const spotifyRegex = /^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]{22})([?&].*)?$/i;
  const spotifyUriRegex = /^spotify:track:([a-zA-Z0-9]{22})$/i;
  return spotifyRegex.test(url.trim()) || spotifyUriRegex.test(url.trim());
}

export function extractSpotifyTrackId(url: string): string | null {
  const match = url.trim().match(/(?:spotify\.com\/track\/|spotify:track:)([a-zA-Z0-9]{22})/i);
  return match ? match[1] : null;
}

export class SpotifyService {
  /**
   * Resolves Spotify track metadata via Spotify embed / oEmbed endpoints.
   */
  public async getTrackInfo(url: string): Promise<SpotifyTrackInfo> {
    if (!isValidSpotifyUrl(url)) {
      throw new Error('Invalid Spotify URL provided.');
    }

    const trackId = extractSpotifyTrackId(url);
    if (!trackId) {
      throw new Error('Could not parse Spotify track ID.');
    }

    try {
      // 1. Try Spotify embed page next_data extraction
      const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
      const response = await fetch(embedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (response.ok) {
        const html = await response.text();
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);

        if (nextDataMatch && nextDataMatch[1]) {
          const nextData = JSON.parse(nextDataMatch[1]);
          const entity = nextData.props?.pageProps?.state?.data?.entity;

          if (entity) {
            const title = entity.name || entity.title || 'Spotify Track';
            const artists = Array.isArray(entity.artists)
              ? entity.artists.map((a: any) => a.name).join(', ')
              : 'Spotify Artist';
            const durationMs = entity.duration || 180000;
            const duration = Math.round(durationMs / 1000);

            let thumbnail = '';
            const images = entity.visualIdentity?.image;
            if (Array.isArray(images) && images.length > 0) {
              thumbnail = images[images.length - 1]?.url || images[0]?.url || '';
            }

            return {
              title,
              artist: artists,
              duration,
              thumbnail,
              spotifyUrl: url.trim(),
              source: 'spotify',
            };
          }
        }
      }

      // 2. Fallback to Spotify oEmbed
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url.trim())}`;
      const oembedRes = await fetch(oembedUrl);
      if (oembedRes.ok) {
        const oembedData: any = await oembedRes.json();
        return {
          title: oembedData.title || 'Spotify Track',
          artist: oembedData.author_name || 'Spotify Artist',
          duration: 180,
          thumbnail: oembedData.thumbnail_url || '',
          spotifyUrl: url.trim(),
          source: 'spotify',
        };
      }

      throw new Error('Spotify metadata could not be fetched.');
    } catch (err: any) {
      console.error('[SpotifyService] Error getting Spotify track info:', err.message || err);
      throw new Error(`Failed to resolve Spotify track: ${err.message || 'Unknown error'}`);
    }
  }

  /**
   * Extracts a streamable audio URL for the Spotify track via cobalt.tools.
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

    const info = await this.getTrackInfo(url);
    const trackId = extractSpotifyTrackId(url) || 'track';
    const finalTitle = customTitle?.trim() || info.title;
    const finalArtist = customArtist?.trim() || info.artist;
    const duration = info.duration;
    const artworkUrl = info.thumbnail;

    try {
      console.log(`[SpotifyService] Extracting stream via cobalt for: "${finalTitle}" by ${finalArtist}`);
      const { streamUrl } = await extractAudioUrl(url.trim());

      return {
        storageKey: `cobalt/rooms/${roomId}/spotify_${trackId}`,
        storageUrl: streamUrl,
        title: finalTitle,
        artist: finalArtist,
        duration,
        artworkUrl,
      };
    } catch (err: any) {
      console.error('[SpotifyService] Cobalt extraction failed:', err?.message || err);
      throw new Error(`Audio extraction failed: ${err?.message || 'cobalt.tools unavailable'}`);
    }
  }
}

export const spotifyService = new SpotifyService();
