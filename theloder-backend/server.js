const express = require('express');
const cors = require('cors');
const { exec } = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/resolve', async (req, res) => {
  const { link, type } = req.query;

  if (!link || !/^https?:\/\/.+$/.test(link)) {
    return res.status(400).json({ error: 'Invalid or missing URL' });
  }

  const format = type === 'audio' ? 'bestaudio' : 'bestvideo+bestaudio/best';

  try {
    const result = await exec(link, {
      dumpSingleJson: true,
      noCheckCertificate: true
    });

    let url;

    if (type === 'audio') {
      url = result.formats.find(f => f.acodec !== 'none' && f.vcodec === 'none')?.url;
    } else {
      url = result.url;
    }

    if (!url) throw new Error('No valid format found');

    return res.json({ url });
  } catch (err) {
    console.error('yt-dlp error:', err.message);
    return res.status(500).json({ error: 'Failed to resolve media URL' });
  }
});

app.listen(PORT, () => {
  console.log(`yt-dlp resolver API listening on port ${PORT}`);
});
