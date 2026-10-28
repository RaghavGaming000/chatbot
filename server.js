const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3101;
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(__dirname, 'uploads');
const USERS_FILE = path.join(DATA, 'users.json');
const CHATS_FILE = path.join(DATA, 'chats.json');
const SETTINGS_FILE = path.join(DATA, 'settings.json');

for (const d of [DATA, UPLOADS]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

function readJSON(f, fallback) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; }
}
function writeJSON(f, data) { fs.writeFileSync(f, JSON.stringify(data, null, 2)); }

function ensureDefaults() {
  const users = readJSON(USERS_FILE, {});
  if (!users.admin) {
    users.admin = {
      username: 'admin',
      hash: bcrypt.hashSync('admin@434', 10),
      role: 'admin',
      createdAt: Date.now()
    };
    writeJSON(USERS_FILE, users);
  }
  if (!fs.existsSync(CHATS_FILE)) writeJSON(CHATS_FILE, {});
  if (!fs.existsSync(SETTINGS_FILE)) {
    writeJSON(SETTINGS_FILE, {
      systemPrompt: 'You are Headburst AI, a sharp helpful assistant. Be clear, useful, and concise unless depth is needed. Analyze uploaded files and images carefully when described.',
      apiBase: process.env.OPENAI_BASE_URL || process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
      apiKey: process.env.XAI_API_KEY || process.env.OPENAI_API_KEY || '',
      model: process.env.CHAT_MODEL || 'qwen2.5:1.5b'
    });
  }
}
ensureDefaults();

const sessions = new Map();
function token() { return crypto.randomBytes(24).toString('hex'); }
function getUser(req) {
  const t = req.cookies?.cb_session || (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return null;
  const s = sessions.get(t);
  if (!s) return null;
  const users = readJSON(USERS_FILE, {});
  return users[s.username] ? { username: s.username, role: users[s.username].role } : null;
}
function requireAuth(req, res, next) {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'login required' });
  req.user = u;
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/|text\/|application\/(pdf|json|zip)|application\/vnd/.test(file.mimetype) ||
      /\.(txt|md|json|csv|log|js|py|html|css|pdf|png|jpg|jpeg|gif|webp)$/i.test(file.originalname);
    cb(null, !!ok);
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOADS));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/register', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'username 3-24 letters/numbers/_' });
  if (password.length < 6) return res.status(400).json({ error: 'password min 6 chars' });
  const users = readJSON(USERS_FILE, {});
  if (users[username]) return res.status(400).json({ error: 'username taken' });
  users[username] = { username, hash: bcrypt.hashSync(password, 10), role: 'user', createdAt: Date.now() };
  writeJSON(USERS_FILE, users);
  const t = token();
  sessions.set(t, { username });
  res.cookie('cb_session', t, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 7 * 864e5 });
  res.json({ ok: true, username, role: 'user' });
});

app.post('/api/login', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const users = readJSON(USERS_FILE, {});
  const u = users[username];
  if (!u || !bcrypt.compareSync(password, u.hash)) return res.status(401).json({ error: 'invalid login' });
  const t = token();
  sessions.set(t, { username });
  res.cookie('cb_session', t, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 7 * 864e5 });
  res.json({ ok: true, username, role: u.role });
});

app.post('/api/logout', (req, res) => {
  const t = req.cookies?.cb_session;
  if (t) sessions.delete(t);
  res.clearCookie('cb_session');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'not logged in' });
  res.json(u);
});

app.get('/api/chats', requireAuth, (req, res) => {
  const all = readJSON(CHATS_FILE, {});
  const list = Object.values(all)
    .filter(c => c.username === req.user.username)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, createdAt: c.createdAt }));
  res.json({ chats: list });
});

app.post('/api/chats', requireAuth, (req, res) => {
  const all = readJSON(CHATS_FILE, {});
  const id = uuidv4();
  const chat = {
    id,
    username: req.user.username,
    title: String(req.body?.title || 'New chat').slice(0, 80),
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  all[id] = chat;
  writeJSON(CHATS_FILE, all);
  res.json({ chat: { id: chat.id, title: chat.title } });
});

app.get('/api/chats/:id', requireAuth, (req, res) => {
  const all = readJSON(CHATS_FILE, {});
  const chat = all[req.params.id];
  if (!chat || chat.username !== req.user.username) return res.status(404).json({ error: 'not found' });
  res.json({ chat });
});

app.delete('/api/chats/:id', requireAuth, (req, res) => {
  const all = readJSON(CHATS_FILE, {});
  const chat = all[req.params.id];
  if (!chat || chat.username !== req.user.username) return res.status(404).json({ error: 'not found' });
  delete all[req.params.id];
  writeJSON(CHATS_FILE, all);
  res.json({ ok: true });
});

function readFileSnippet(filepath, mimetype, originalname) {
  try {
    const ext = path.extname(originalname).toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(ext) || (mimetype || '').startsWith('image/')) {
      const b64 = fs.readFileSync(filepath).toString('base64');
      const mime = mimetype || 'image/png';
      return { type: 'image', mime, b64, note: `User uploaded image: ${originalname}` };
    }
    if (/\.(txt|md|json|csv|log|js|ts|py|html|css|xml|yml|yaml)$/i.test(ext) || (mimetype || '').startsWith('text/')) {
      const text = fs.readFileSync(filepath, 'utf8').slice(0, 12000);
      return { type: 'text', text, note: `File ${originalname}:\n${text}` };
    }
    const stat = fs.statSync(filepath);
    return { type: 'binary', note: `Uploaded file ${originalname} (${stat.size} bytes).` };
  } catch (e) {
    return { type: 'error', note: `Could not read ${originalname}: ${e.message}` };
  }
}

async function callLLM(messages, settings) {
  const key = settings.apiKey || process.env.XAI_API_KEY || process.env.OPENAI_API_KEY || '';
  const ollamaBase = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const localModel = settings.model || process.env.CHAT_MODEL || 'qwen2.5:1.5b';
  const system = settings.systemPrompt || 'You are Headburst AI, a sharp helpful assistant. You can chat, explain, and write code.';

  const apiMessages = messages.map(m => {
    if (m.images && m.images.length) {
      const content = [{ type: 'text', text: m.content || '' }];
      for (const img of m.images) {
        content.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.b64}` } });
      }
      return { role: m.role, content };
    }
    return { role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content || '') };
  });

  try {
    const r = await fetch(ollamaBase + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: localModel,
        stream: false,
        messages: [
          { role: 'system', content: system },
          ...apiMessages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          }))
        ],
        options: { temperature: 0.7, num_predict: 1024 }
      })
    });
    if (r.ok) {
      const j = await r.json();
      const textOut = j.message?.content || j.response;
      if (textOut) return textOut;
    }
  } catch (e) {}

  if (key) {
    const base = (settings.apiBase || 'https://api.x.ai/v1').replace(/\/$/, '');
    const model = settings.model || 'grok-beta';
    const r = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, ...apiMessages],
        temperature: 0.7
      })
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error('AI API error: ' + r.status + ' ' + err.slice(0, 200));
    }
    const j = await r.json();
    return j.choices?.[0]?.message?.content || 'No response';
  }

  return 'Local AI is not running. Install Ollama:\ncurl -fsSL https://ollama.com/install.sh | sh\nollama pull qwen2.5:1.5b\nsystemctl restart chatbot';
}

app.post('/api/chats/:id/message', requireAuth, upload.array('files', 5), async (req, res) => {
  try {
    const all = readJSON(CHATS_FILE, {});
    const chat = all[req.params.id];
    if (!chat || chat.username !== req.user.username) return res.status(404).json({ error: 'not found' });

    let text = String(req.body?.message || '').trim();
    const images = [];
    const fileNotes = [];
    for (const f of req.files || []) {
      const snip = readFileSnippet(f.path, f.mimetype, f.originalname);
      if (snip.type === 'image') images.push({ mime: snip.mime, b64: snip.b64 });
      if (snip.note) fileNotes.push(snip.note);
      if (snip.text) fileNotes.push(snip.text);
    }
    if (fileNotes.length) text = (text + '\n\n' + fileNotes.join('\n\n')).trim();

    const userMsg = { role: 'user', content: text || '(file upload)', images, at: Date.now() };
    chat.messages.push(userMsg);

    const settings = readJSON(SETTINGS_FILE, {});
    const history = chat.messages.slice(-20).map(m => ({ role: m.role, content: m.content, images: m.images }));
    const answer = await callLLM(history, settings);
    const assistantMsg = { role: 'assistant', content: answer, at: Date.now() };
    chat.messages.push(assistantMsg);
    if (chat.messages.length <= 2 && text) chat.title = text.slice(0, 48);
    chat.updatedAt = Date.now();
    writeJSON(CHATS_FILE, all);
    res.json({ user: userMsg, assistant: assistantMsg, title: chat.title });
  } catch (e) {
    res.status(500).json({ error: e.message || 'failed' });
  }
});

app.get('/api/settings', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  const s = readJSON(SETTINGS_FILE, {});
  res.json({
    systemPrompt: s.systemPrompt,
    apiBase: s.apiBase,
    model: s.model,
    hasKey: !!(s.apiKey || process.env.XAI_API_KEY || process.env.OPENAI_API_KEY)
  });
});

app.post('/api/settings', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  const s = readJSON(SETTINGS_FILE, {});
  const b = req.body || {};
  if (typeof b.systemPrompt === 'string') s.systemPrompt = b.systemPrompt.slice(0, 4000);
  if (typeof b.apiBase === 'string') s.apiBase = b.apiBase.slice(0, 200);
  if (typeof b.model === 'string') s.model = b.model.slice(0, 80);
  if (typeof b.apiKey === 'string' && b.apiKey.trim()) s.apiKey = b.apiKey.trim();
  writeJSON(SETTINGS_FILE, s);
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log('chatbot on', PORT));
