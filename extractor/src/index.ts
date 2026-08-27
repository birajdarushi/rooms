import express, { Request, Response } from 'express';
import cors from 'cors';
import { spawn } from 'child_process';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'WaveRooms Cloud Extractor', time: Date.now() });
});

/**
 * Common yt-dlp arguments to bypass datacenter IP blocks (using Android & iOS clients)
 */
const BASE_YTDLP_ARGS = [
  '--extractor-args',
  'youtube:player_client=android,ios',
  '--no-check-certificates',
  '--no-warnings',
  '--prefer-free-formats',
];

/**
 * Execute yt-dlp safely with argument array
 */
function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const fullArgs = [...BASE_YTDLP_ARGS, ...args];
    const proc = spawn('yt-dlp', fullArgs);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `yt-dlp exited with code ${code}`));
      }
    });
  });
}

/**
 * POST /extract/youtube
 */
app.post(['/extract/youtube', '/extract'], async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const streamUrl = await runYtDlp(['-g', '-f', 'bestaudio/best', url]);
    const metaRaw = await runYtDlp([
      '--no-playlist',
      '--print',
      '%(title)s###%(uploader)s###%(duration)s###%(thumbnail)s',
      url,
    ]).catch(() => '');

    const metaParts = metaRaw.split('###');
    const title = metaParts[0] || 'YouTube Track';
    const artist = metaParts[1] || 'YouTube';
    const duration = Math.round(Number(metaParts[2]) || 180);
    const thumbnail = metaParts[3] || '';

    return res.json({
      title,
      artist,
      duration,
      thumbnail,
      streamUrl: streamUrl.split('\n')[0],
      source: 'youtube',
    });
  } catch (err: any) {
    console.error('[Extractor] YouTube extraction error:', err.message);
    return res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

/**
 * POST /extract/spotify
 */
app.post('/extract/spotify', async (req: Request, res: Response) => {
  const { title, artist, url } = req.body;
  const cleanArtist = (artist || '').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const cleanTitle = (title || '').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const searchQuery = `ytsearch1:${cleanTitle} ${cleanArtist} audio`.trim();

  try {
    const streamUrl = await runYtDlp(['-g', '-f', 'bestaudio/best', searchQuery]);
    const metaRaw = await runYtDlp([
      '--no-playlist',
      '--print',
      '%(title)s###%(uploader)s###%(duration)s###%(thumbnail)s',
      searchQuery,
    ]).catch(() => '');

    const metaParts = metaRaw.split('###');
    const trackTitle = title || metaParts[0] || 'Spotify Track';
    const trackArtist = artist || metaParts[1] || 'Spotify Artist';
    const duration = Math.round(Number(metaParts[2]) || 180);
    const thumbnail = metaParts[3] || '';

    return res.json({
      title: trackTitle,
      artist: trackArtist,
      duration,
      thumbnail,
      streamUrl: streamUrl.split('\n')[0],
      source: 'spotify',
      spotifyUrl: url,
    });
  } catch (err: any) {
    console.error('[Extractor] Spotify extraction error:', err.message);
    return res.status(500).json({ error: err.message || 'Spotify extraction failed' });
  }
});

/**
 * GET /stream/pipe
 */
app.get('/stream/pipe', (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return res.status(400).send('Missing url parameter');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'audio/mpeg');

  const proc = spawn('yt-dlp', [
    ...BASE_YTDLP_ARGS,
    '-o',
    '-',
    '-f',
    'bestaudio',
    targetUrl,
  ]);

  proc.stdout.pipe(res);
  req.on('close', () => proc.kill());
});

app.listen(PORT, () => {
  console.log(`WaveRooms Cloud Extractor running on port ${PORT}`);
});
