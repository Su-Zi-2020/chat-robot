// POST /api/tts —— 把一段文字合成语音。返回音频二进制；失败返回 JSON 信封。

import { Router } from 'express';
import { fail, CODE } from '../http.js';
import { requireUser } from '../middleware/auth.js';
import { synthesize, TtsUnavailable } from '../services/tts.js';
import { config } from '../config.js';

const CONTENT_TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/ogg' };

const router = Router();

router.post('/', requireUser, async (req, res) => {
    const text = req.body?.text;
    if (typeof text !== 'string' || !text.trim()) {
        return fail(res, 400, CODE.BAD_PARAM, 'text 不能为空');
    }
    if ([...text].length > 500) {
        return fail(res, 400, CODE.BAD_PARAM, 'text 过长（上限 500 字，按句切分后调用）');
    }

    try {
        const buf = await synthesize(text);
        res.writeHead(200, {
            'content-type': CONTENT_TYPES[config.tts.format] ?? 'audio/mpeg',
            'content-length': buf.length,
            'cache-control': 'private, max-age=86400',
        });
        res.end(buf);
    } catch (e) {
        if (e instanceof TtsUnavailable) return fail(res, 503, CODE.UPSTREAM, e.message);
        console.error('[tts] 合成失败:', e.message);
        fail(res, 500, CODE.INTERNAL, '语音合成失败');
    }
});

export default router;
