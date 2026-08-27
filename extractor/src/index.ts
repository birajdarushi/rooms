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
 * Execute yt-dlp helper
 */
function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => (stdout += data.toString()));
    proc.stderr.on('data', (data) => (stderr += data.toString()));

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

/**
 * POST /extract/youtube
 * Returns streamable audio URL and metadata
 */
app.post(['/extract/youtube', '/extract'], async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const rawJson = await runYtDlp([
      '-J',
      '--no-playlist',
      '--format',
      'bestaudio/best',
      url,
    ]);

    const info = JSON.parse(rawJson);
    const audioUrl = info.url || (info.formats && info.formats[0]?.url);

    return res.json({
      title: info.title,
      artist: info.uploader || info.channel || 'Unknown Artist',
      duration: Math.round(info.duration || 180),
      thumbnail: info.thumbnail || '',
      streamUrl: audioUrl,
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
    const rawJson = await runYtDlp([
      '-J',
      '--no-playlist',
      '--format',
      'bestaudio/best',
      searchQuery,
    ]);

    const info = JSON.parse(rawJson);
    const item = info.entries ? info.entries[0] : info;
    const audioUrl = item?.url || (item?.formats && item?.formats[0]?.url);

    return res.json({
      title: title || item?.title,
      artist: artist || item?.uploader || 'Spotify Artist',
      duration: Math.round(item?.duration || 180),
      thumbnail: item?.thumbnail || '',
      streamUrl: audioUrl,
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
 * Direct HTTP Audio Pipe with Range & CORS support for seamless playback
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
