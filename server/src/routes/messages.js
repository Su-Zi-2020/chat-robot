// POST /api/messages —— 取全部历史（SQLite）。

import { Router } from 'express';
import { success } from '../http.js';
import messagesDAO from '../dao/messages.dao.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();

router.post('/', requireUser, (req, res) => { // 直接查库返回
    success(res, { messages: messagesDAO.listAll(req.user.id) });
});

// 清空当前用户的全部历史（消息 + 摘要）。不可恢复。
router.post('/clear', requireUser, (req, res) => {
    const removed = messagesDAO.clearAll(req.user.id);
    success(res, { removed });
});

export default router;
