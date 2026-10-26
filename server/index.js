// 最简 demo：没有大模型、没有流式、没有依赖。
// 只演示“前端发一句话 → 后端回一句话”。

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

// 单用户 demo：所有消息存在内存里，重启就清空
const messages = [];

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

// 假的“模型”：把你说的话回显一遍
function fakeReply(text) {
  return `我收到了：「${text}」。这是一个占位回复，还没有接入真实模型。`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 发消息
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: '请求体不是合法 JSON' });
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return json(res, 400, { error: 'text 不能为空' });

    messages.push({ role: 'user', content: text });
    const reply = fakeReply(text);
    messages.push({ role: 'assistant', content: reply });

    return json(res, 200, { reply });
  }

  // 拿历史（刷新页面时用）
  if (url.pathname === '/api/messages' && req.method === 'GET') {
    return json(res, 200, { messages });
  }

  // 静态页面
  if (req.method === 'GET') {
    try {
      const html = await readFile(join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch {
      res.writeHead(500).end('找不到 public/index.html');
      return;
    }
  }

  json(res, 404, { error: 'Not Found' });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。换一个：PORT=3001 node server/index.js`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => {
  console.log(`打开 http://localhost:${PORT}`);
});
