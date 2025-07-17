#!/bin/bash

# Install Node.js dependencies first
echo "Installing Node.js dependencies..."
npm install || { echo "Failed to install Node.js dependencies"; exit 1; }

# Create a bin directory if it doesn't exist
mkdir -p ./bin

# Download and install yt-dlp in the project directory
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./bin/yt-dlp || { echo "Failed to download yt-dlp"; exit 1; }
chmod +x ./bin/yt-dlp || { echo "Failed to set yt-dlp executable"; exit 1; }

# Update PATH to include the bin directory (for this session)
export PATH=./bin:$PATH

# Install ffmpeg
echo "Installing ffmpeg..."
apt-get update && apt-get install -y ffmpeg || { echo "Failed to install ffmpeg"; exit 1; }

# Verify installations
./bin/yt-dlp --version && echo "yt-dlp installed successfully" || echo "yt-dlp verification failed"
ffmpeg -version && echo "ffmpeg installed successfully" || echo "ffmpeg verification failed"












