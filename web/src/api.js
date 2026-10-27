// 所有后端调用都走这里：统一处理信封、错误、SSE 解析。
// 接口契约见 docs/api.md。

const JSON_HEADERS = { 'content-type': 'application/json' };

/** 取历史消息 */
export async function fetchMessages() {
    const res = await fetch('/api/messages', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: '{}',
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.code !== 0) {
        throw new Error(data?.message ?? `请求失败（HTTP ${res.status}）`);
    }
    return data.data.messages ?? [];
}

/**
  * 流式发一句话。
  * 服务端帧格式：data: {"type":"start"} / {"delta":"…"} / {"type":"done"}
  *
  * @returns {Promise<string>} 完整回复文本
  */
export async function streamChat({ text, onDelta, signal }) {
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ text }),
        signal,
    });

    // 校验失败时返回的是 JSON 信封（非 200）
    if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? `请求失败（HTTP ${res.status}）`);
    }

    if (!res.body) throw new Error('响应没有 body，浏览器可能不支持流式');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true }); // 字节层：不切坏中文

        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {       // 帧层：切出完整行
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;

            const payload = JSON.parse(line.slice(5).trim());
            if (payload.type === 'error') {
                throw new Error(payload.message ?? '生成中断');
            }
            if (payload.delta) {
                full += payload.delta;
                onDelta?.(payload.delta);
            }
            if (payload.type === 'done') return full;
        }
    }
    return full;
}
