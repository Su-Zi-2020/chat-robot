// POST /api/chat —— 流式返回。
// 现在是 mock：把一段固定回复按字切开、定时推送，用来验证前端逐字渲染。
// 接真实模型时，只要把 generateReply + 循环换成模型的增量流即可。

import { Router } from 'express';
import { fail, CODE } from '../http.js';
import { appendExchange } from './messages.js';
import { generateReply } from '../services/reply.js';

const MAX_TEXT = 2000;
const CHUNK_SIZE = 2;      // 每次推几个字
const CHUNK_DELAY = 40;    // 毫秒

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const router = Router();

router.post('/', async (req, res) => {
  const raw = req.body?.text;

  if (typeof raw !== 'string') {
    return fail(res, 400, CODE.BAD_PARAM, 'text 必须是字符串');
  }

  const text = raw.trim();
  if (!text) return fail(res, 400, CODE.BAD_PARAM, 'text 不能为空');
  if ([...text].length > MAX_TEXT) {
    return fail(res, 400, CODE.BAD_PARAM, `text 过长（上限 ${MAX_TEXT} 字）`);
  }

  // 走 SSE
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no', // 让 nginx 不要缓冲
  });

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // 客户端断开（关页面/取消）时停止推送。
  // 注意：不能用 req.on('close')，它在请求体读完时就触发了（Node 16+ 的行为）。
  let aborted = false;
  res.on('close', () => {
    if (!res.writableEnded) aborted = true;   // 正常结束时 writableEnded 为 true
  });

  const reply = generateReply(text);
  const chars = [...reply]; // 按字符切，避免把 emoji 切成两半

  send({ type: 'start' });

  for (let i = 0; i < chars.length; i += CHUNK_SIZE) {
    if (aborted) return res.end();
    send({ delta: chars.slice(i, i + CHUNK_SIZE).join('') });
    await sleep(CHUNK_DELAY);
  }

  if (aborted) return res.end();

  send({ type: 'done' });
  appendExchange(text, reply);   // 只有完整推送完才落历史
  res.end();
});

export default router;
