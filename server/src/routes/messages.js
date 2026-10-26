// POST /api/messages —— 取全部历史。
// 历史暂时是内存数组（临时状态），接 SQLite 时这个文件整体重写：
// 数组换成 DAO 调用，chat.js 的 import 也跟着改。

import { Router } from 'express';
import { success } from '../http.js';

const messages = [];

/** 取出全部历史（返回引用，调用方不要改） */
export function listMessages() {
    return messages;
}

/** 一问一答成对写入，保证不会出现"有问无答" */
export function appendExchange(userText, assistantText) {
    messages.push({ role: 'user', content: userText });
    messages.push({ role: 'assistant', content: assistantText });
}

const router = Router();

router.post('/', (_req, res) => {
    success(res, { messages: listMessages() });
});

export default router;
