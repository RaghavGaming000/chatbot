#!/bin/bash
set -e
echo "=== Install local AI (Ollama) ==="
if [ "$(id -u)" -ne 0 ]; then echo "run as root"; exit 1; fi

# Install ollama
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

# Start service
systemctl enable ollama 2>/dev/null || true
systemctl start ollama 2>/dev/null || true
sleep 2

# Small model for ~5GB RAM VMs
MODEL="${CHAT_MODEL:-qwen2.5:1.5b}"
echo "Pulling model $MODEL (this can take several minutes)..."
ollama pull "$MODEL"

# Update chatbot settings if present
if [ -f /opt/chatbot/data/settings.json ]; then
  python3 - << PY
import json
p="/opt/chatbot/data/settings.json"
try:
  s=json.load(open(p))
except: s={}
s["model"]="$MODEL"
s["apiBase"]="http://127.0.0.1:11434/v1"
json.dump(s, open(p,"w"), indent=2)
print("settings updated")
PY
fi

if [ -f /opt/chatbot/server.js ]; then
  sed -i "s/secure: true/secure: false/g" /opt/chatbot/server.js
fi

systemctl restart chatbot 2>/dev/null || true
sleep 1
echo "Testing ollama..."
curl -s http://127.0.0.1:11434/api/tags | head -c 400; echo
echo "=== Local AI ready. Model: $MODEL ==="
echo "Chat at http://$(hostname -I | awk '{print $1}')/"
