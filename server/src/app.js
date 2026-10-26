// 最简版后端。约定：
//   1) 所有接口都是 POST；
//   2) 成功固定 HTTP 200；失败用真实状态码（400 / 404 / 500）；
//   3) 响应体固定信封：{ code, message, data? }，前端只看 code。

import express from 'express';

const MAX_TEXT = 2000;

// 业务码：0 成功，1xxx 参数/请求问题，5xxx 服务问题
const CODE = {
  OK: 0,
  BAD_PARAM: 1001,
  BAD_JSON: 1002,
  TOO_LARGE: 1003,
  NOT_FOUND: 1004,
  INTERNAL: 5000,
};

const app = express();
app.use(express.json({ limit: '100kb' }));

// 单用户 demo：消息存在内存，重启就清空
const messages = [];

// 成功：200 + 信封
const ok = (res, data = null) => res.status(200).json({ code: CODE.OK, message: 'ok', data });

// 失败：真实状态码 + 信封（httpStatus 与 code 一一对应）
const fail = (res, httpStatus, code, message) => res.status(httpStatus).json({ code, message });

function fakeReply(text) {
  return `我收到了：「${text}」。这是一个占位回复，还没有接入真实模型。`;
}

// 发消息
app.post('/api/chat', (req, res) => {
  const raw = req.body?.text;

  if (typeof raw !== 'string') return fail(res, 400, CODE.BAD_PARAM, 'text 必须是字符串');

  const text = raw.trim();
  if (!text) return fail(res, 400, CODE.BAD_PARAM, 'text 不能为空');
  if (text.length > MAX_TEXT) return fail(res, 400, CODE.BAD_PARAM, `text 过长（上限 ${MAX_TEXT} 字）`);

  messages.push({ role: 'user', content: text });
  const reply = fakeReply(text);
  messages.push({ role: 'assistant', content: reply });

  ok(res, { reply });
});

// 取历史（也用 POST：一个接口一个功能，不区分读写方法）
app.post('/api/messages', (_req, res) => {
  ok(res, { messages });
});

// 兜底：未知接口
app.use((_req, res) => fail(res, 404, CODE.NOT_FOUND, '接口不存在'));

// 兜底：任何异常都收敛成信封，不漏 HTML
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') return fail(res, 400, CODE.BAD_JSON, '请求体不是合法 JSON');
  if (err?.type === 'entity.too.large') return fail(res, 413, CODE.TOO_LARGE, '请求体过大');
  console.error('[unhandled]', err);
  fail(res, 500, CODE.INTERNAL, '服务内部错误');
});

export default app;
