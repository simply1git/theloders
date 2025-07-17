const express = require('express');
const { exec } = require('youtube-dl-exec');
const WebSocket = require('ws');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const cacheDir = path.join(__dirname, 'cache');
const clients = new Set();

if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

app.use(express.json());

const wss = new WebSocket.Server({ noServer: true });
wss.on('connection', (ws) => clients.add(ws));

app.get('/download', async (req, res) => {
    const { link, type, quality, format, filename, id } = req.query;

    if (!link || !isValidUrl(link)) return res.status(400).json({ error: 'Invalid or missing URL' });
    if (!['video', 'audio', 'both'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (type === 'video' && !quality) return res.status(400).json({ error: 'Quality required for video' });
    if (!['mp4', 'mp3', 'wav'].includes(format)) return res.status(400).json({ error: 'Invalid format' });

    const cacheKey = `${encodeURIComponent(link)}-${type}-${quality}-${format}`;
    const outputFile = path.join(cacheDir, `${cacheKey}.${format}`);

    res.setHeader('Content-Disposition', `attachment; filename="${filename || `downloaded_${type}`}.${format}"`);
    res.setHeader('Content-Type', `video/${format}`);

    const options = {
        output: outputFile,
        mergeOutputFormat: format,
        noCheckCertificates: true,
        noWarnings: true,
        concurrentFragments: 4,
        progress: true,
        format: type === 'video'
            ? `bestvideo[height<=?${quality.replace('k', '000')}]+bestaudio/best`
            : 'bestaudio/best'
    };

    try {
        const subprocess = exec(link, options, { stdio: ['ignore', 'pipe', 'pipe'] });

        subprocess.stdout.on('data', (chunk) => {
            const str = chunk.toString();
            const match = str.match(/(\d+\.\d+)%/);
            if (match && id) {
                const progress = parseFloat(match[1]);
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN)
                        client.send(JSON.stringify({ progress, id }));
                });
            }
        });

        subprocess.on('exit', async (code) => {
            if (code !== 0 || !fs.existsSync(outputFile)) {
                console.error('Download failed');
                return res.status(500).json({ error: 'Download failed' });
            }
            fs.createReadStream(outputFile).pipe(res);
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/preview', async (req, res) => {
    const { link } = req.query;
    if (!link || !isValidUrl(link)) return res.status(400).json({ error: 'Invalid URL' });

    const options = { format: 'bestaudio/best', getUrl: true, noCheckCertificates: true };

    try {
        const result = await exec(link, options);
        const url = result.stdout.trim();
        res.setHeader('Content-Type', 'audio/mpeg');
        const range = 'bytes=0-300000'; // ~300KB preview
        const previewRes = await fetch(url, { headers: { Range: range } });
        previewRes.body.pipe(res);
    } catch (err) {
        console.error('Preview error:', err.message);
        res.status(500).json({ error: 'Preview failed' });
    }
});

const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    cleanupCache();
    setInterval(cleanupCache, 6 * 60 * 60 * 1000);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

function isValidUrl(str) {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

async function cleanupCache() {
    try {
        const files = await fsPromises.readdir(cacheDir);
        const now = Date.now();
        for (const file of files) {
            const fullPath = path.join(cacheDir, file);
            const stats = await fsPromises.stat(fullPath);
            if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
                await fsPromises.unlink(fullPath);
            }
        }
    } catch (err) {
        console.error('Cache cleanup error:', err.message);
    }
}






