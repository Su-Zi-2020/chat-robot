// POST /api/messages —— 取全部历史。
// 历史暂时是内存数组（临时状态），接 SQLite 时这个文件整体重写：
// 数组换成 DAO 调用，chat.js 的 import 也跟着改。

import { Router } from 'express';
import { success } from '../http.js';

const messages = []; // 临时存储：进程重启即清空

export function listMessages() { // 取出全部历史（返回引用，调用方不要改）
    return messages;
}

export function appendExchange(userText, assistantText) { // 一问一答成对写入，保证不会出现"有问无答"
    messages.push({ role: 'user', content: userText });
    messages.push({ role: 'assistant', content: assistantText });
}

const router = Router();

router.post('/', (_req, res) => { // 直接返回内存里的数组
    success(res, { messages: listMessages() });
});

export default router;
