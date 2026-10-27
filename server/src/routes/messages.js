// POST /api/messages —— 取全部历史（SQLite）。

import { Router } from 'express';
import { success } from '../http.js';
import messagesDAO from '../dao/messages.dao.js';

const router = Router();

router.post('/', (_req, res) => { // 直接查库返回
    success(res, { messages: messagesDAO.listAll() });
});

export default router;
