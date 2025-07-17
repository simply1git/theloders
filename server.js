const express = require('express');
const fetch = require('node-fetch');
const { exec } = require('youtube-dl-exec');
const WebSocket = require('ws');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const cacheDir = path.join(__dirname, 'cache');

app.use(express.json());

if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

// --- WebSocket setup ---
const wss = new WebSocket.Server({ noServer: true });
const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

// Upgrade HTTP server to handle WS
const server = app.listen(port, () => console.log(`Server running on port ${port}`));
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit('connection', ws, req);
  });
});

// Utility
function isValidUrl(str) {
  try { new URL(str); return true; }
  catch { return false; }
}

async function cleanupCache() {
  const files = await fsPromises.readdir(cacheDir);
  const now = Date.now();
  for (const file of files) {
    const filePath = path.join(cacheDir, file);
    const stats = await fsPromises.stat(filePath);
    if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
      await fsPromises.unlink(filePath);
    }
  }
}
// Run at startup and every 6 hours
cleanupCache();
setInterval(cleanupCache, 6 * 60 * 60 * 1000);

app.get('/download', async (req, res) => {
  const { link, type, quality, format, filename, id } = req.query;
  if (!link || !isValidUrl(link)) return res.status(400).json({ error: 'Invalid URL' });
  if (!['video','audio','both'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (type === 'video' && !quality) return res.status(400).json({ error: 'Quality required for video' });
  if (!['mp4','mp3','wav'].includes(format)) return res.status(400).json({ error: 'Invalid format' });

  const cacheKey = `${encodeURIComponent(link)}-${type}-${quality}-${format}`;
  const cachedFile = path.join(cacheDir, `${cacheKey}.${format}`);

  res.setHeader('Content-Disposition', `attachment; filename="${filename || `downloaded_${type}`}.${format}"`);
  res.setHeader('Content-Type', type === 'audio' ? 'audio/mpeg' : `video/${format}`);

  // Build yt-dlp options
  const maxHeight = quality?.replace('k','000') || '1080';
  const formatSelector = type === 'audio'
    ? 'bestaudio/best'
    : `bestvideo[height<=?${maxHeight}]+bestaudio/best`;
  const options = [
    '-f', formatSelector,
    '--merge-output-format', format,
    '--output', cachedFile,
    '--no-check-certificate',
    '--no-warnings',
    '--progress'
  ];

  try {
    // Run yt-dlp
    const subprocess = exec(link, options, { stdio: ['ignore','pipe','pipe'] });
    subprocess.stdout.on('data', chunk => {
      const str = chunk.toString();
      const m = str.match(/(\d+\.\d+)%/);
      if (m) {
        const progress = parseFloat(m[1]);
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ id, progress }));
          }
        }
      }
    });
    await subprocess; // wait for completion

    // Stream file
    fs.createReadStream(cachedFile).pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

app.get('/preview', async (req, res) => {
  const { link } = req.query;
  if (!link || !isValidUrl(link)) return res.status(400).json({ error: 'Invalid URL' });

  try {
    const url = await exec(link, ['-f','bestaudio/best','--get-url','--no-check-certificate'], { stdio: ['ignore','pipe','ignore'] })
      .then(r => r.stdout.trim());

    const head = await fetch(url, { method: 'HEAD' });
    const maxBytes = Math.min(30000, parseInt(head.headers.get('content-length')||'30000',10));
    res.setHeader('Content-Type', 'audio/mpeg');

    const resp = await fetch(url, { headers: { Range: `bytes=0-${maxBytes}` } });
    resp.body.pipe(res);
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: 'Preview failed' });
  }
});
