#!/bin/bash
npm install
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
apt-get update && apt-get install -y ffmpeg
yt-dlp --version
ffmpeg -version