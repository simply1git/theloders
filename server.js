const express = require('express');
let { exec } = require('yt-dlp-exec'); // Fallback to binary if package fails
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Fallback to binary if yt-dlp-exec fails
try {
    exec = require('yt-dlp-exec').exec || exec;
} catch (e) {
    exec = (args, options, callback) => {
        const { spawn } = require('child_process');
        const ytDlpPath = path.join(__dirname, 'bin', 'yt-dlp');
        const child = spawn(ytDlpPath, args, { ...options, stdio: 'pipe' });
        let stdout = '', stderr = '';
        child.stdout.on('data', data => stdout += data);
        child.stderr.on('data', data => stderr += data);
        child.on('close', code => callback(code ? new Error(stderr) : null, stdout));
        return child;
    };
}

const wss = new WebSocket.Server({ noServer: true });
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

app.get('/download', async (req, res) => {
    const { link, type, quality, format, filename, id } = req.query;

    if (!link || !isValidUrl(link)) return res.status(400).json({ error: 'Invalid or missing URL' });
    if (!['video', 'audio', 'both'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (type === 'video' && !quality) return res.status(400).json({ error: 'Quality required for video' });
    if (!['mp4', 'mp3', 'wav'].includes(format)) return res.status(400).json({ error: 'Invalid format' });

    const cacheKey = `${link}-${type}-${quality}-${format}`;
    const cachedFile = path.join(cacheDir, `${cacheKey}.${format}`);

    res.setHeader('Content-Disposition', `attachment; filename="${filename || `downloaded_${type}`}.${format}"`);
    res.setHeader('Content-Type', `video/${format}`);

    const ws = req.socket._wss;
    let progressInterval;

    try {
        let options = [
            '-f',
            type === 'video' ? `bestvideo[height<=?${quality.replace('k', '000') || '1080'}]+bestaudio/best` :
            type === 'audio' ? 'bestaudio/best' :
            `bestvideo[height<=?${quality.replace('k', '000') || '1080'}]+bestaudio/best`,
            '--merge-output-format', format,
            '--output', cachedFile,
            '--concurrent-fragments', '4',
            '--no-check-certificate',
            '--no-warnings',
            '--progress'
        ];

        if (type === 'audio' && req.query.preview === 'true') {
            options.push('--get-url');
            exec(link, options, (error, stdout) => {
                if (error) return res.status(500).json({ error: error.message });
                const url = stdout.trim();
                res.setHeader('Content-Type', 'audio/mpeg');
                fetch(url).then(resp => resp.body.pipe(res)).catch(err => res.status(500).json({ error: err.message }));
            });
            return;
        }

        exec(link, options, { stdio: ['pipe', 'pipe', 'pipe'] }, (error, stdout, stderr) => {
            if (error) {
                res.status(500).json({ error: error.message || stderr });
                return;
            }
            const str = stdout.toString();
            if (str.includes('download')) {
                const match = str.match(/(\d+\.\d+)%/);
                if (match) {
                    const progress = parseFloat(match[1]);
                    if (ws) ws.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ progress, id }));
                    });
                }
            }
            if (error) res.status(500).json({ error: error.message });
            else fs.createReadStream(cachedFile).pipe(res);
            cleanupCache();
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/preview', async (req, res) => {
    const { link } = req.query;
    if (!link || !isValidUrl(link)) return res.status(400).json({ error: 'Invalid URL' });
    const options = ['-f', 'bestaudio/best', '--get-url', '--no-check-certificate'];
    try {
        exec(link, options, (error, stdout) => {
            if (error) return res.status(500).json({ error: error.message });
            const url = stdout.trim();
            res.setHeader('Content-Type', 'audio/mpeg');
            const response = fetch(url, { method: 'HEAD' });
            const duration = response.headers.get('content-length') ? Math.min(30000, parseInt(response.headers.get('content-length'))) : 30000;
            fetch(url, { headers: { 'Range': `bytes=0-${duration}` } }).then(resp => resp.body.pipe(res));
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const server = app.listen(port, () => console.log(`Server running on port ${port}`));
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

function isValidUrl(string) {
    try { new URL(string); return true; } catch { return false; }
}

async function cleanupCache() {
    const files = await fs.readdir(cacheDir);
    const now = Date.now();
    for (const file of files) {
        const filePath = path.join(cacheDir, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) await fs.unlink(filePath);
    }
}
