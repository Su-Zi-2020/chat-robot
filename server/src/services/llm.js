// 模型调用层：把 OpenAI 兼容接口的 SSE 流，变成一个异步生成器。
// 上层（路由）只管 for await 拿 delta，不用关心 HTTP 细节。

import { config } from '../config.js';

export class UpstreamError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

/**
  * 流式调用模型。
  * @param {object} opts
  * @param {Array<{role:string, content:string}>} opts.messages
  * @param {AbortSignal} [opts.signal]
  * @yields {string} 增量文本
  */
export async function* streamModel({ messages, signal }) {
    if (!config.apiKey) {
        throw new UpstreamError('服务端没有配置 API key（环境变量 DEEPSEEK_API_KEY 或 server/config/config.js）', 500);
    }

    let res;
    try {
        res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({ model: config.model, messages, stream: true }),
            signal,
        });
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw new UpstreamError(`连不上模型服务：${e.message}`, 502);
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new UpstreamError(`模型返回 HTTP ${res.status}：${body.slice(0, 200)}`, 502);
    }

    // 两层缓冲：字节层（中文不被切坏）+ 帧层（JSON 不被切坏）
    let buf = '';
    const decoder = new TextDecoder();

    for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;

            const data = line.slice(5).trim();
            if (data === '[DONE]') return;

            try {
                const delta = JSON.parse(data).choices?.[0]?.delta?.content;
                if (delta) yield delta;
            } catch {
                // 心跳行 / 非 JSON 行
            }
        }
    }
}
