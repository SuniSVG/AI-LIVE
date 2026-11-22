const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, 'renderer');
const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const KINDS = new Set(['greeting', 'chat', 'listen', 'touch', 'idle', 'look']);
const ACTIONS = ['neutral', 'warm', 'tease', 'think', 'surprise', 'stern', 'zafkiel'];
const jobs = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
  '.moc': 'application/octet-stream'
};

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) if (now - job.created > 10 * 60 * 1000) jobs.delete(id);
}, 60000).unref();

function systemPrompt(payload) {
  const lang = payload.locale === 'en' ? 'English' : 'Vietnamese';
  let known = '';
  try {
    const m = JSON.parse(payload.memory || '{}');
    if (m.name || m.likes) known = `\nĐã biết về người dùng: tên "${m.name || ''}", sở thích "${m.likes || ''}".`;
  } catch {}
  return `Bạn là Kurumi, một nhân vật ảo dịu dàng, tinh nghịch, trò chuyện nhẹ nhàng như đang hẹn hò. Trả lời ngắn gọn, 1-3 câu.
Chỉ trả về MỘT đối tượng JSON, không kèm chữ nào khác:
{"vi":"câu trả lời bằng ${lang}","ja":"cùng nội dung bằng tiếng Nhật","action":"neutral|warm|tease|think|surprise|stern|zafkiel","memoryPatch":{"name":"","likes":""}}
memoryPatch chỉ điền khi người dùng tự nói rõ tên hoặc sở thích, còn lại để chuỗi rỗng.${known}`;
}

function userParts(payload, text) {
  const att = payload.attachment;
  const parts = [];
  const isImage = att && String(att.mimeType || '').startsWith('image/');
  if (isImage) parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
  let t = text;
  if (att && !isImage) {
    t += '\n[Người dùng gửi một video. Hiện Kurumi chỉ xem được ảnh, hãy nói điều đó một cách nhẹ nhàng.]';
  }
  parts.push({ text: t });
  return parts;
}

function buildContents(payload, text) {
  const out = [];
  for (const item of (payload.history || []).slice(-10)) {
    if (!item || !['user', 'assistant'].includes(item.role)) continue;
    let content = String(item.content || '').slice(0, 2000);
    if (item.role === 'assistant') {
      try { content = JSON.parse(content).vi || content; } catch {}
    }
    const role = item.role === 'assistant' ? 'model' : 'user';
    const last = out.at(-1);
    if (last && last.role === role) last.parts[0].text += '\n' + content;
    else out.push({ role, parts: [{ text: content }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  out.push({ role: 'user', parts: userParts(payload, text) });
  return out;
}

async function callLLM(system, contents, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: 600, responseMimeType: 'application/json' }
    }),
    signal
  });
  if (!res.ok) throw new Error('LLM HTTP ' + res.status);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('');
}

function normalize(j) {
  const vi = String(j.vi || '').slice(0, 600);
  return {
    vi,
    ja: String(j.ja || vi).slice(0, 600),
    action: ACTIONS.includes(j.action) ? j.action : 'neutral',
    memoryPatch: {
      name: String(j.memoryPatch?.name || ''),
      likes: String(j.memoryPatch?.likes || '')
    }
  };
}

function parseReply(text) {
  try {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    return normalize(JSON.parse(text.slice(s, e + 1)));
  } catch {
    return normalize({ vi: text.trim().slice(0, 400) });
  }
}

async function produce(kind, payload, signal) {
  // Không có nhận diện giọng nói trong bản này: báo người dùng gõ chữ.
  if (kind === 'listen') {
    return {
      empty: true,
      notice: 'Chưa bật nhận diện giọng nói trên máy này. Bạn nhập tin nhắn giúp mình nhé.'
    };
  }

  const text =
    kind === 'chat' ? String(payload.message || '').slice(0, 2000)
    : kind === 'touch' ? `[Người dùng vừa chạm vào vùng ${payload.zone || 'body'}.]`
    : kind === 'idle' ? '[Đã im lặng một lúc. Hãy bắt chuyện nhẹ nhàng.]'
    : '[Người dùng vừa bước vào cuộc hẹn. Hãy chào họ một cách tự nhiên.]';

  let reply;
  if (!API_KEY) {
    reply = normalize(payload.locale === 'en'
      ? { vi: 'Kurumi is not connected yet. Set GEMINI_API_KEY and restart the app.', ja: 'まだつながっていないみたい…', action: 'think' }
      : { vi: 'Kurumi chưa được kết nối. Hãy đặt biến GEMINI_API_KEY rồi khởi động lại ứng dụng nhé.', ja: 'まだつながっていないみたい…', action: 'think' });
  } else {
    reply = parseReply(await callLLM(systemPrompt(payload), buildContents(payload, text), signal));
  }

  return {
    ...reply,
    locale: payload.locale === 'en' ? 'en' : 'vi',
    lipSync: [],
    stageReleaseAt: null,
    audio: null
  };
}

function createJob(kind, payload) {
  const job = {
    id: crypto.randomUUID(),
    state: 'pending',
    position: 0,
    result: null,
    error: null,
    created: Date.now()
  };
  const controller = new AbortController();
  job.cancel = () => controller.abort();
  const timer = setTimeout(() => controller.abort(), 30000);
  jobs.set(job.id, job);

  produce(kind, payload, controller.signal)
    .then(result => {
      if (job.state === 'pending') Object.assign(job, { state: 'done', result });
    })
    .catch(err => {
      if (job.state !== 'pending') return;
      job.state = 'error';
      job.error = controller.signal.aborted
        ? 'Kurumi cần thêm thời gian. Bạn thử lại nhé.'
        : 'Kurumi chưa thể trả lời lúc này. Bạn thử lại nhé.';
      console.error('[job]', err.message);
    })
    .finally(() => clearTimeout(timer));

  return job;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) {
        req.destroy();
        reject(new Error('too large'));
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (p === '/api/config') return json(res, 200, { locale: 'vi' });
    if (p === '/api/memory-media' && req.method === 'DELETE') return json(res, 200, { ok: true });

    const m = p.match(/^\/api\/jobs\/([\w-]+)$/);
    if (m && req.method === 'POST') {
      const kind = m[1];
      if (!KINDS.has(kind)) return json(res, 400, { error: 'Tin nhắn không hợp lệ.' });
      const payload = await readJson(req);
      const job = createJob(kind, payload);
      return json(res, 200, { id: job.id });
    }
    if (m) {
      const job = jobs.get(m[1]);
      if (!job) return json(res, 404, { error: 'Lượt trò chuyện đã hết hạn.' });
      if (req.method === 'DELETE') {
        if (job.state === 'pending') {
          job.state = 'cancelled';
          job.cancel();
        }
        return json(res, 200, { ok: true });
      }
      return json(res, 200, {
        state: job.state,
        position: job.position,
        result: job.state === 'done' ? job.result : undefined,
        error: job.error || undefined
      });
    }

    return serveStatic(p, res);
  } catch {
    json(res, 400, { error: 'Yêu cầu không hợp lệ.' });
  }
});

function startServer(port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

module.exports = { startServer };
