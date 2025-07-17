#!/bin/bash
echo "Installing Node.js dependencies..."
npm install || { echo "Failed to install Node.js dependencies"; exit 1; }
mkdir -p ./bin
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./bin/yt-dlp || { echo "Failed to download yt-dlp"; exit 1; }
chmod +x ./bin/yt-dlp || { echo "Failed to set yt-dlp executable"; exit 1; }
export PATH=./bin:$PATH
echo "Installing ffmpeg..."
apt-get update && apt-get install -y ffmpeg || { echo "Failed to install ffmpeg"; exit 1; }
./bin/yt-dlp --version && echo "yt-dlp installed successfully" || echo "yt-dlp verification failed"
ffmpeg -version && echo "ffmpeg installed successfully" || echo "ffmpeg verification failed"





