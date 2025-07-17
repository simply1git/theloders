#!/bin/bash

echo "Installing Node.js dependencies..."
npm install || { echo "Failed to install Node.js dependencies"; exit 1; }

mkdir -p ./bin

echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./bin/yt-dlp || { echo "Failed to download yt-dlp"; exit 1; }
chmod +x ./bin/yt-dlp || { echo "Failed to set yt-dlp executable"; exit 1; }

export PATH=./bin:$PATH

echo "Downloading ffmpeg..."
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ./bin/ffmpeg.tar.xz || { echo "Failed to download ffmpeg"; exit 1; }
tar -xJf ./bin/ffmpeg.tar.xz -C ./bin --strip-components=1 --wildcards '*/ffmpeg' || { echo "Failed to extract ffmpeg"; exit 1; }
chmod +x ./bin/ffmpeg || { echo "Failed to set ffmpeg executable"; exit 1; }

./bin/yt-dlp --version && echo "yt-dlp installed successfully" || echo "yt-dlp verification failed"
./bin/ffmpeg -version && echo "ffmpeg installed successfully" || echo "ffmpeg verification failed"















