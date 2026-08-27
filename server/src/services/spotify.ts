import { SpotifyTrackInfo } from '../shared';

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

export interface SpotifyResolvedTrack extends SpotifyTrackInfo {
  audioStreamUrl?: string;
}

export class SpotifyService {
  /**
   * Resolves Spotify track metadata and direct high-speed audio stream via Spotify embed.
   */
  public async getTrackInfo(url: string): Promise<SpotifyResolvedTrack> {
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

            const audioStreamUrl =
              entity.audioPreview?.url ||
              entity.audio?.url ||
              entity.preview_url ||
              undefined;

            return {
              title,
              artist: artists,
              duration,
              thumbnail,
              spotifyUrl: url.trim(),
              source: 'spotify',
              audioStreamUrl,
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
   * Resolves direct streamable audio URL for the Spotify track.
   * Zero disk usage — streams directly from Spotify's global CDN.
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
    let duration = info.duration;
    const artworkUrl = info.thumbnail;

    let streamUrl = info.audioStreamUrl || url;

    // If Cloud Extractor microservice is configured, extract 100% full-length audio stream
    const EXTRACTOR_URL = process.env.EXTRACTOR_URL;
    if (EXTRACTOR_URL) {
      try {
        console.log(`[SpotifyService] Calling Cloud Extractor for: "${finalTitle}"`);
        const res = await fetch(`${EXTRACTOR_URL}/extract/spotify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: finalTitle, artist: finalArtist, url }),
          signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
          const data: any = await res.json();
          if (data.streamUrl) {
            streamUrl = data.streamUrl;
            if (data.duration) duration = data.duration;
            console.log(`[SpotifyService] ✅ Full audio stream resolved from Cloud Extractor!`);
          }
        }
      } catch (err: any) {
        console.warn(`[SpotifyService] Cloud Extractor fallback to preview:`, err.message);
      }
    }

    return {
      storageKey: `spotify/rooms/${roomId}/${trackId}`,
      storageUrl: streamUrl,
      title: finalTitle,
      artist: finalArtist,
      duration,
      artworkUrl,
    };
  }
}

export const spotifyService = new SpotifyService();
