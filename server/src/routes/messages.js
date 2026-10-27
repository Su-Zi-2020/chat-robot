// POST /api/messages —— 取全部历史（SQLite）。

import { Router } from 'express';
import { success } from '../http.js';
import messagesDAO from '../dao/messages.dao.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();

router.post('/', requireUser, (req, res) => { // 直接查库返回
    success(res, { messages: messagesDAO.listAll(req.user.id) });
});

export default router;
