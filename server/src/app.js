// 最简版后端：只用 Express 返回 JSON，不接模型、不流式。

import express from 'express';

const app = express();
app.use(express.json());

// 单用户 demo：消息存在内存，重启就清空
const messages = [];

function fakeReply(text) {
  return `我收到了：「${text}」。这是一个占位回复，还没有接入真实模型。`;
}

app.post('/api/chat', (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) return res.status(400).json({ error: 'text 不能为空' });

  messages.push({ role: 'user', content: text });
  const reply = fakeReply(text);
  messages.push({ role: 'assistant', content: reply });

  res.json({ reply });
});

app.get('/api/messages', (_req, res) => {
  res.json({ messages });
});

export default app;
