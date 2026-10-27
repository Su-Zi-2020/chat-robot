// POST /api/chat —— 流式转发模型的 SSE。
// 帧格式：{"type":"start"} / {"delta":"…"} / {"type":"done"} / {"type":"error","message":"…"}

import { Router } from 'express';
import { fail, CODE } from '../http.js';
import { appendExchange, listMessages } from './messages.js';
import { streamModel, UpstreamError } from '../services/llm.js';
import { config } from '../config.js';

const MAX_TEXT = 2000;

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

    // 带上最近若干条历史，让模型有上下文
    const history = listMessages().slice(-config.maxHistory);
    const messages = [...history, { role: 'user', content: text }];

    // 先建连、先拿响应头：这样上游失败时还能返回 JSON 信封
    const controller = new AbortController();
    res.on('close', () => {
        if (!res.writableEnded) controller.abort();   // 客户端走了，中断上游
    });

    const stream = streamModel({ messages, signal: controller.signal });

    let first;
    try {
        first = await stream.next();                 // 拉第一段，确认上游可用
    } catch (e) {
        if (e instanceof UpstreamError) {
            return fail(res, e.status, CODE.UPSTREAM, e.message);
        }
        return fail(res, 500, CODE.INTERNAL, '模型调用失败');
    }

    res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
    });

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    send({ type: 'start' });

    let reply = '';

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
        appendExchange(text, reply);
    } catch (e) {
        if (controller.signal.aborted) {
            // 客户端主动断开：不写历史，直接结束
        } else {
            send({ type: 'error', message: e.message ?? '生成中断' });
        }
    } finally {
        res.end();
    }
});

export default router;
