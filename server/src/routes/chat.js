// POST /api/chat —— 发一句话，拿回一条回复。
import { Router } from 'express';
import { ok, fail } from '../http.js';
import { CODE } from '../codes.js';
import { appendExchange } from '../store.js';
import { generateReply } from '../services/reply.js';

const MAX_TEXT = 2000;

const router = Router();

router.post('/', (req, res) => {
  const raw = req.body?.text;

  if (typeof raw !== 'string') {
    return fail(res, 400, CODE.BAD_PARAM, 'text 必须是字符串');
  }

  const text = raw.trim();
  if (!text) return fail(res, 400, CODE.BAD_PARAM, 'text 不能为空');
  if ([...text].length > MAX_TEXT) {
    return fail(res, 400, CODE.BAD_PARAM, `text 过长（上限 ${MAX_TEXT} 字）`);
  }

  const reply = generateReply(text);
  appendExchange(text, reply);

  ok(res, { reply });
});

export default router;
