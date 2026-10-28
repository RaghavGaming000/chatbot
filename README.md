# Headburst Chat

Grok-style local AI chatbot (Ollama).

## Run on localhost

```bash
npm install
ollama pull qwen2.5:1.5b   # optional local AI
npm start
```

Open http://127.0.0.1:3101  
Login: **admin** / **admin@434**

## Features
- Grok-inspired dark UI (sidebar, empty state, chips, composer)
- Multi-chat history
- File uploads
- Local Ollama model (no API key)
- Optional remote OpenAI-compatible API

## Health
GET `/api/health`
