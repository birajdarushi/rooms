import express, { Request, Response } from 'express';
import cors from 'cors';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'WaveRooms Cloud Extractor', time: Date.now() });
});

/**
 * POST /extract/youtube
 * Returns streamable audio URL and metadata
 */
app.post(['/extract/youtube', '/extract'], async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const streamUrlCmd = `yt-dlp -g -f "bestaudio/best" "${url}"`;
    const metaCmd = `yt-dlp --no-playlist --print "%(title)s###%(uploader)s###%(duration)s###%(thumbnail)s" "${url}"`;

    const [streamRes, metaRes] = await Promise.all([
      execAsync(streamUrlCmd),
      execAsync(metaCmd).catch(() => ({ stdout: '' })),
    ]);

    const streamUrl = streamRes.stdout.trim().split('\n')[0];
    const metaParts = metaRes.stdout.trim().split('###');

    const title = metaParts[0] || 'YouTube Track';
    const artist = metaParts[1] || 'YouTube';
    const duration = Math.round(Number(metaParts[2]) || 180);
    const thumbnail = metaParts[3] || '';

    return res.json({
      title,
      artist,
      duration,
      thumbnail,
      streamUrl,
      source: 'youtube',
    });
  } catch (err: any) {
    console.error('[Extractor] YouTube extraction error:', err.message);
    return res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

/**
 * POST /extract/spotify
 * Searches YouTube for Spotify title + artist and extracts full-length audio stream URL
 */
app.post('/extract/spotify', async (req: Request, res: Response) => {
  const { title, artist, url } = req.body;
  const searchQuery = `ytsearch1:${title || ''} ${artist || ''} audio`.trim();

  try {
    const streamUrlCmd = `yt-dlp -g -f "bestaudio/best" "${searchQuery}"`;
    const metaCmd = `yt-dlp --no-playlist --print "%(title)s###%(uploader)s###%(duration)s###%(thumbnail)s" "${searchQuery}"`;

    const [streamRes, metaRes] = await Promise.all([
      execAsync(streamUrlCmd),
      execAsync(metaCmd).catch(() => ({ stdout: '' })),
    ]);

    const streamUrl = streamRes.stdout.trim().split('\n')[0];
    const metaParts = metaRes.stdout.trim().split('###');

    const trackTitle = title || metaParts[0] || 'Spotify Track';
    const trackArtist = artist || metaParts[1] || 'Spotify Artist';
    const duration = Math.round(Number(metaParts[2]) || 180);
    const thumbnail = metaParts[3] || '';

    return res.json({
      title: trackTitle,
      artist: trackArtist,
      duration,
      thumbnail,
      streamUrl,
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
 * Direct HTTP Audio Pipe with Range & CORS support
 */
app.get('/stream/pipe', (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return res.status(400).send('Missing url parameter');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'audio/mpeg');

  const proc = spawn('yt-dlp', [
    '-o',
    '-',
    '-f',
    'bestaudio',
    targetUrl,
  ]);

  proc.stdout.pipe(res);
  proc.stderr.on('data', () => {});
  req.on('close', () => {
    proc.kill();
  });
});

app.listen(PORT, () => {
  console.log(`WaveRooms Cloud Extractor running on port ${PORT}`);
});
