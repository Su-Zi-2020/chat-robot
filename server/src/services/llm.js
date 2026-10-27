// 模型调用层：把 OpenAI 兼容接口的 SSE 流，包成一个异步生成器。
// 上层（路由）只需要 for await 拿 delta，不用关心 HTTP 细节。

import { config } from '../config.js';

// 上游（模型服务）出错时抛这个，路由据此返回 502 + code 2001
export class UpstreamError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

/**
 * 流式调用模型，逐段产出文本。
 * @param {object} opts
 * @param {Array<{role:string, content:string}>} opts.messages 完整上下文（含本轮用户消息）
 * @param {AbortSignal} [opts.signal] 外部取消信号（客户端断开时中断上游）
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
        if (e.name === 'AbortError') throw e; // 主动取消，交给上层忽略
        throw new UpstreamError(`连不上模型服务：${e.message}`, 502);
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new UpstreamError(`模型返回 HTTP ${res.status}：${body.slice(0, 200)}`, 502);
    }

    // 两层缓冲，缺一不可：
    // 字节层 —— 中文可能被网络切成两半，TextDecoder 的 stream 会暂存不完整字节
    // 帧层   —— 一行 SSE 可能跨多个 chunk，按 \n 切完剩下的留回 buf
    let buf = '';
    const decoder = new TextDecoder();

    for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });

        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);

            if (!line.startsWith('data:')) continue; // 心跳行、空行

            const data = line.slice(5).trim();
            if (data === '[DONE]') return; // OpenAI 约定的结束标记

            try {
                const delta = JSON.parse(data).choices?.[0]?.delta?.content;
                if (delta) yield delta; // 只产出正文增量
            } catch {
                // 非 JSON 行（部分网关会插注释），跳过
            }
        }
    }
}


/**
 * 非流式调用（摘要等内部任务用）。不走 SSE，一次性拿结果。
 * @returns {Promise<string>}
 */
export async function complete({ messages, maxTokens = 800, signal }) {
    if (!config.apiKey) throw new UpstreamError('服务端没有配置 API key', 500);

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, messages, max_tokens: maxTokens, temperature: 0.3 }),
        signal,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new UpstreamError(`摘要请求失败 HTTP ${res.status}：${body.slice(0, 200)}`, 502);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '';
}
