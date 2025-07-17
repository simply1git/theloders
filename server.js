const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { exec } = require('youtube-dl-exec');
const WebSocket = require('ws');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const cacheDir = path.join(__dirname, 'cache');

app.use(cors());
app.use(express.json());

if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

// --- WebSocket setup ---
const wss = new WebSocket.Server({ noServer: true });
const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

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
cleanupCache();
setInterval(cleanupCache, 6 * 60 * 60 * 1000);

app.get('/download', async (req, res) => {
  const { link, type, quality, format, filename, id } = req.query;
  console.log(`Download requested: ${link}, type=${type}, quality=${quality}, format=${format}`);

  if (!link || !isValidUrl(link)) return res.status(400).json({ error: 'Invalid URL' });
  if (!['video','audio','both'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (type === 'video' && !quality) return res.status(400).json({ error: 'Quality required for video' });
  if (!['mp4','mp3','wav'].includes(format)) return res.status(400).json({ error: 'Invalid format' });

  const cacheKey = `${encodeURIComponent(link)}-${type}-${quality}-${format}`;
  const cachedFile = path.join(cacheDir, `${cacheKey}.${format}`);

  res.setHeader('Content-Disposition', `attachment; filename="${filename || `downloaded_${type}`}.${format}"`);
  res.setHeader('Content-Type', type === 'audio' ? 'audio/mpeg' : `video/${format}`);

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
    const subprocess = exec(link, options, { stdio: ['ignore','pipe','pipe'] });

    subprocess.stdout.on('data', chunk => {
      const str = chunk.toString();
      const match = str.match(/(\d+\.\d+)%/);
      if (match) {
        const progress = parseFloat(match[1]);
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ id, progress }));
          }
        }
      }
    });

    await subprocess;
    fs.createReadStream(cachedFile).pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});







