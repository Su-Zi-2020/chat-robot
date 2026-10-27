// POST /api/chat —— 把模型的流式输出转发给前端。
// 帧格式：{"type":"start"} / {"delta":"…"} / {"type":"done"} / {"type":"error","message":"…"}

import { Router } from 'express';
import { fail, CODE } from '../http.js';
import messagesDAO from '../dao/messages.dao.js';
import { streamModel, UpstreamError } from '../services/llm.js';
import { config } from '../config.js';
import { requireUser } from '../middleware/auth.js';

const MAX_TEXT = 2000; // 单条输入上限，和前端 PRD 一致

const router = Router();

router.post('/', requireUser, async (req, res) => { // 主流程：校验 → 建流 → 转发 → 落库
    const raw = req.body?.text;

    if (typeof raw !== 'string') {
        return fail(res, 400, CODE.BAD_PARAM, 'text 必须是字符串');
    }

    const text = raw.trim();
    if (!text) return fail(res, 400, CODE.BAD_PARAM, 'text 不能为空');
    if ([...text].length > MAX_TEXT) {
        return fail(res, 400, CODE.BAD_PARAM, `text 过长（上限 ${MAX_TEXT} 字）`);
    }

    // 带上最近若干条历史，让模型有上下文（只取尾部，控制 token）
    // 只取 role/content：id、createdAt 是我们自己的字段，不要发给模型
    const history = messagesDAO
        .listRecent(config.maxHistory, req.user.id)
        .map(({ role, content }) => ({ role, content }));
    const messages = [...history, { role: 'user', content: text }];

    // 客户端断开（关页面 / 取消）时中断上游请求，避免白烧 token
    const controller = new AbortController();
    res.on('close', () => {
        if (!res.writableEnded) controller.abort(); // 正常结束时 writableEnded 为 true
    });

    const stream = streamModel({ messages, signal: controller.signal });

    // 先拉第一帧再建连：这样上游失败时还能返回 JSON 信封
    let first;
    try {
        first = await stream.next();
    } catch (e) {
        if (e instanceof UpstreamError) {
            return fail(res, e.status, CODE.UPSTREAM, e.message);
        }
        return fail(res, 500, CODE.INTERNAL, '模型调用失败');
    }

    // 上游可用，切成 SSE
    res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no', // 让 nginx 不要缓冲，否则流式会变成一次性吐
    });

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`); // 发一帧
    send({ type: 'start' });

    let reply = ''; // 累积完整回复，结束后落库

    try {
        if (!first.done && first.value) {
            reply += first.value;
            send({ delta: first.value });
        }

        for await (const delta of stream) {
            reply += delta;
            send({ delta });
        }

        send({ type: 'done' });

        try {
            messagesDAO.appendExchange(text, reply, req.user.id); // 只有完整答完才成对写历史
        } catch (e) {
            // done 帧已经发出去了，改不了响应；只能记日志，避免"用户以为存了其实没存"
            console.error('[chat] 写入历史失败:', e.message);
        }
    } catch (e) {
        if (controller.signal.aborted) {
            // 客户端主动断开：不写历史，安静结束
        } else {
            send({ type: 'error', message: e.message ?? '生成中断' }); // 流已开始，只能用帧报错
        }
    } finally {
        res.end();
    }
});

export default router;
