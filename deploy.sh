#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-/opt/chatbot}"
echo "Deploying Headburst chatbot to $TARGET"
mkdir -p "$TARGET/public" "$TARGET/data" "$TARGET/uploads"
cp -f "$ROOT/server.js" "$TARGET/"
cp -f "$ROOT/package.json" "$TARGET/"
cp -f "$ROOT/public/index.html" "$TARGET/public/"
cd "$TARGET" && npm install --omit=dev
echo "Files installed. Start with: PORT=3101 node server.js"
echo "Or: sudo cp deploy/chatbot.service /etc/systemd/system/ && sudo systemctl enable --now chatbot"
