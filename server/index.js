// server/index.js —— HTTP 入口：把 session 层接到网络上。
// 接口契约见 docs/api.md。

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from './session.js';

const PORT = Number(process.env.PORT || 8787);
const WEB_DIST = fileURLToPath(new URL('../web/dist', import.meta.url));

// 会话存在内存里；生产环境应该换成 SQLite + LRU 淘汰
const sessions = new Map();
const MAX_SESSIONS = 500;

function getSession(id) {
  if (!sessions.has(id)) {
    if (sessions.size >= MAX_SESSIONS) {
      sessions.delete(sessions.keys().next().value); // 简单淘汰最旧的
    }
    sessions.set(id, createSession({ stream: true }));
  }
  return sessions.get(id);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req, limit = 100 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sseWrite(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// ---------- POST /api/chat ----------
async function handleChat(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { error: '请求体不是合法 JSON' });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json(res, 400, { error: 'text 不能为空' });
  if (text.length > 8000) return json(res, 400, { error: 'text 过长（上限 8000 字）' });

  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : crypto.randomUUID();
  const session = getSession(sessionId);

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no', // 让 nginx 不要缓冲
  });
  sseWrite(res, { sessionId });

  // 浏览器关掉页面 → 中断上游请求，别继续烧 token
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    await session.send(text, {
      signal: controller.signal,
      onDelta: (delta) => sseWrite(res, { delta }),
    });
    sseWrite(res, { done: true });
  } catch (e) {
    if (controller.signal.aborted) {
      // 客户端走了，不用再写
    } else {
      sseWrite(res, { error: e.message });
    }
  } finally {
    res.end();
  }
}

// ---------- GET /api/session/:id/messages ----------
function handleMessages(res, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return json(res, 404, { error: '会话不存在' });
  return json(res, 200, { sessionId, messages: session.messages });
}

// ---------- 静态文件 ----------
async function serveStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(WEB_DIST, rel);

  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    // 前端是单页应用：找不到就回 index.html
    try {
      const html = await readFile(join(WEB_DIST, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(html);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('前端还没构建：cd web && npm install && npm run build');
    }
  }
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    if (pathname === '/api/health') {
      json(res, 200, { ok: true });
    } else if (pathname === '/api/chat' && req.method === 'POST') {
      await handleChat(req, res);
    } else if (pathname.startsWith('/api/session/') && req.method === 'GET') {
      const id = pathname.split('/')[3];
      handleMessages(res, id);
    } else if (pathname.startsWith('/api/')) {
      json(res, 404, { error: '接口不存在' });
    } else if (req.method === 'GET') {
      await serveStatic(res, pathname);
    } else {
      json(res, 405, { error: '方法不允许' });
    }
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: e.message });
    else res.end();
  } finally {
    console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
  }
});

server.listen(PORT, () => {
  console.log(`API 已启动： http://localhost:${PORT}`);
  console.log(`静态目录： ${WEB_DIST}`);
});
