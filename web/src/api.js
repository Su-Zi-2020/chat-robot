// 前端所有后端调用的出口：统一处理信封、错误、SSE 解析。
// 接口契约见 docs/api.md。

const JSON_HEADERS = { 'content-type': 'application/json' };

/** 取历史消息 */
export async function fetchMessages() { // 拉取全部历史（全 POST）
    const res = await fetch('/api/messages', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: '{}', // 没有参数也要发空对象，保持协议一致
    });

    const data = await res.json().catch(() => null);
    // 两种失败都收敛成同一个 Error：HTTP 非 2xx、或业务 code 非 0
    if (!res.ok || !data || data.code !== 0) {
        throw new Error(data?.message ?? `请求失败（HTTP ${res.status}）`);
    }
    return data.data.messages ?? [];
}

/**
 * 流式发一句话。
 * 服务端帧格式：{"type":"start"} / {"delta":"…"} / {"type":"done"} / {"type":"error"}
 *
 * @returns {Promise<string>} 完整回复文本
 */
export async function streamChat({ text, onDelta, signal }) { // 流式对话：返回完整文本，边收边回调
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ text }),
        signal, // 外部可中断（关页面 / 停止按钮）
    });

    // 建连前的失败仍是 JSON 信封：参数错误 400、上游失败 502
    if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? `请求失败（HTTP ${res.status}）`);
    }

    if (!res.body) throw new Error('响应没有 body，浏览器可能不支持流式');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = ''; // 帧层缓冲：一行可能跨多个 chunk
    let full = ''; // 累积完整回复

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true }); // 字节层：不把中文切坏

        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) { // 切出完整行，剩下的留回 buf
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;

            const payload = JSON.parse(line.slice(5).trim());

            if (payload.type === 'error') {
                throw new Error(payload.message ?? '生成中断'); // 流已开始，只能靠帧报错
            }
            if (payload.delta) {
                full += payload.delta;
                onDelta?.(payload.delta); // 交给界面增量渲染
            }
            if (payload.type === 'done') return full;
        }
    }
    return full;
}
