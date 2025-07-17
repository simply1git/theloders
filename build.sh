#!/bin/bash

# Install Node.js dependencies
npm install

# Create a bin directory if it doesn't exist
mkdir -p ./bin

# Download and install yt-dlp in the project directory
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./bin/yt-dlp
chmod +x ./bin/yt-dlp

# Update PATH to include the bin directory (for this session)
export PATH=./bin:$PATH

# Install ffmpeg (already succeeded, but keep for consistency)
apt-get update && apt-get install -y ffmpeg

# Verify installations
./bin/yt-dlp --version || echo "yt-dlp installation failed"
ffmpeg -version || echo "ffmpeg installation failed"















