# Headburst Chatbot

Self-hosted chat UI with login, file uploads, and **local AI via Ollama** (no API key required).

## Features
- User login / register (default admin)
- Chat history stored on disk
- File uploads (text / images)
- Local model: Ollama (`qwen2.5:1.5b` recommended for ~5GB RAM)
- Optional remote OpenAI-compatible API

## Quick start

```bash
npm install
# Local AI (recommended)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:1.5b
npm start
```

Open http://127.0.0.1:3101

**Default login:** `admin` / `admin@434`

## Production (nginx + systemd)

```bash
sudo bash install-on-vps.sh
# or after files are in /opt/chatbot:
sudo bash apply-local-ai.sh
```

## Environment
| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3101` | HTTP port |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama base URL |
| `CHAT_MODEL` | `qwen2.5:1.5b` | Local model name |
| `XAI_API_KEY` / `OPENAI_API_KEY` | — | Optional remote API |
| `OPENAI_BASE_URL` | — | Optional remote base |

## License
Private / project use.
