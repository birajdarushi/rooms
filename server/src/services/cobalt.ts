/**
 * Cobalt.tools API client — serverless-compatible audio extraction
 * Replaces yt-dlp/ffmpeg for Vercel deployment.
 * Docs: https://github.com/imputnet/cobalt
 */

const COBALT_API_URL = 'https://api.cobalt.tools/';

interface CobaltResponse {
  status?: 'stream' | 'tunnel' | 'redirect' | 'picker' | 'error';
  url?: string;
  filename?: string;
  error?: { code: string; context?: any };
  picker?: Array<{ type: string; url: string; thumb?: string }>;
}

export interface CobaltAudioResult {
  streamUrl: string;
  filename?: string;
}

/**
 * Extracts a direct streamable audio URL from a Spotify or YouTube URL using cobalt.tools.
 * Returns a temporary (~6hr) CDN URL that clients can stream from directly — no file storage needed.
 */
export async function extractAudioUrl(url: string): Promise<CobaltAudioResult> {
  console.log(`[Cobalt] Extracting audio for: ${url}`);

  const response = await fetch(COBALT_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: url.trim(),
      downloadMode: 'audio',
      audioFormat: 'mp3',
      audioBitrate: '128',
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Cobalt API error ${response.status}: ${text || response.statusText}`);
  }

  const data: CobaltResponse = await response.json();

  if (data.status === 'error') {
    throw new Error(`Cobalt extraction failed: ${data.error?.code || 'unknown'}`);
  }

  if (data.status === 'stream' || data.status === 'tunnel' || data.status === 'redirect') {
    if (!data.url) throw new Error('Cobalt returned empty URL');
    console.log(`[Cobalt] Got stream URL (status=${data.status})`);
    return { streamUrl: data.url, filename: data.filename };
  }

  if (data.status === 'picker' && data.picker && data.picker.length > 0) {
    console.log(`[Cobalt] Picker response, using first item`);
    return { streamUrl: data.picker[0].url };
  }

  throw new Error(`Unexpected cobalt response: ${JSON.stringify(data)}`);
}
