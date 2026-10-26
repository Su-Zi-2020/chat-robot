// 组装层：只挂中间件和路由，不写业务。
// 接口契约见 docs/api.md —— 改接口时两边一起改。

import express from 'express';
import chatRouter from './routes/chat.js';
import messagesRouter from './routes/messages.js';
import { fail, CODE } from './http.js';

const app = express();

app.use(express.json({ limit: '100kb' }));

app.use('/api/chat', chatRouter);
app.use('/api/messages', messagesRouter);

// 未知接口
app.use((_req, res) => fail(res, 404, CODE.NOT_FOUND, '接口不存在'));

// 任何异常都收敛成信封，不漏 HTML
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') return fail(res, 400, CODE.BAD_JSON, '请求体不是合法 JSON');
  if (err?.type === 'entity.too.large') return fail(res, 413, CODE.TOO_LARGE, '请求体过大');
  console.error('[unhandled]', err);
  fail(res, 500, CODE.INTERNAL, '服务内部错误');
});

export default app;
