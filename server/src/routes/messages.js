// POST /api/messages —— 取全部历史（全 POST：一个接口一个功能）。
import { Router } from 'express';
import { ok } from '../http.js';
import { listMessages } from './store.js';

const router = Router();

router.post('/', (_req, res) => {
  ok(res, { messages: listMessages() });
});

export default router;
