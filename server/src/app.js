// 最简版后端：只用 Express 返回 JSON，不接模型、不流式。
// 契约见 docs/api.md —— 改接口时两边一起改。

import express from 'express';

const MAX_TEXT = 2000;   // 与前端 PRD 的上限保持一致

const app = express();
app.use(express.json({ limit: '100kb' }));

// 单用户 demo：消息存在内存，重启就清空
const messages = [];

function fakeReply(text) {
    return `我收到了：「${text}」。这是一个占位回复，还没有接入真实模型。`;
}

app.post('/api/chat', (req, res) => {
    const raw = req.body?.text;

    if (typeof raw !== 'string') {
        return res.status(400).json({ error: 'text 必须是字符串' });
    }

    const text = raw.trim();
    if (!text) return res.status(400).json({ error: 'text 不能为空' });
    if (text.length > MAX_TEXT) {
        return res.status(400).json({ error: `text 过长（上限 ${MAX_TEXT} 字）` });
    }

    messages.push({ role: 'user', content: text });
    const reply = fakeReply(text);
    messages.push({ role: 'assistant', content: reply });

    res.json({ reply });
});

app.get('/api/messages', (_req, res) => {
    res.json({ messages });
});

// 统一 404：未知接口
app.use((_req, res) => {
    res.status(404).json({ error: '接口不存在' });
});

// 统一错误处理：保证任何情况下返回 JSON，不漏 HTML
app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: '请求体不是合法 JSON' });
    }
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: '请求体过大' });
    }
    console.error('[unhandled]', err);
    res.status(500).json({ error: '服务内部错误' });
});

export default app;
