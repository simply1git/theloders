#!/bin/bash
set -e

echo "Installing Node.js dependencies..."
npm install

mkdir -p ./bin

echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./bin/yt-dlp
chmod +x ./bin/yt-dlp

echo "Downloading ffmpeg..."
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ./bin/ffmpeg.tar.xz
tar -xJf ./bin/ffmpeg.tar.xz -C ./bin --strip-components=1 --wildcards '*/ffmpeg'
chmod +x ./bin/ffmpeg

echo "Verifying tools..."
./bin/yt-dlp --version
./bin/ffmpeg -version

echo "✅ Build completed."













