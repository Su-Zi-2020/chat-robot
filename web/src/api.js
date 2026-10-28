// 前端所有后端调用的出口：统一处理信封、错误、SSE 解析。
// 约定：HTTP 状态码只作参考，业务结果一律看响应体里的 code（0 = 成功）。
// 接口契约见 docs/api.md。

const JSON_HEADERS = { 'content-type': 'application/json' };

/** 带上业务码的错误，界面可以按 code 区分处理（如 1005 = 未登录） */
export class ApiError extends Error {
    constructor(message, code, status) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
    }
}

// 解析响应体；不是 JSON 就返回 null（比如网关返回了 HTML 错误页）
async function readJson(res) {
    return res.json().catch(() => null);
}

/** 取公开配置（输入上限等），失败返回默认值 */
export async function fetchConfig() {
    try {
        const res = await fetch('/api/config', { method: 'POST', headers: JSON_HEADERS, body: '{}' });
        const body = await readJson(res);
        if (body?.code === 0) return body.data;
    } catch {
        // 后端没起来时用默认值
    }
    return { maxInputChars: 2000, models: [], model: '' };
}

/** 取历史消息 */
export async function fetchMessages() { // 拉取当前用户的全部历史
    const res = await fetch('/api/messages', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: '{}',
    });

    const body = await readJson(res);
    if (!body || body.code !== 0) {
        throw new ApiError(body?.message ?? `请求失败（HTTP ${res.status}）`, body?.code, res.status);
    }
    return body.data.messages ?? [];
}

/** 清空当前用户的全部历史（服务端数据库一并删除，不可恢复） */
export async function clearMessages() {
    const res = await fetch('/api/messages/clear', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: '{}',
    });

    const body = await readJson(res);
    if (!body || body.code !== 0) {
        throw new ApiError(body?.message ?? `清空失败（HTTP ${res.status}）`, body?.code, res.status);
    }
    return body.data;
}

/** 当前登录用户；未登录返回 null */
export async function fetchMe() { // 查登录态
    const res = await fetch('/api/auth/me');
    const body = await readJson(res);
    if (!body || body.code !== 0) {
        throw new ApiError(body?.message ?? `请求失败（HTTP ${res.status}）`, body?.code, res.status);
    }
    return body.data.user ?? null;
}

/** 退出登录（失败也不影响界面，最多提示一下） */
export async function logout() { // 清服务端 session + cookie
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
}

/**
 * 流式发一句话。
 * 服务端帧格式：{"type":"start"} / {"delta":"…"} / {"type":"done"} / {"type":"error"}
 *
 * @returns {Promise<string>} 完整回复文本
 */
export async function streamChat({ text, model, onDelta, signal }) { // 流式对话：返回完整文本，边收边回调
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ text, model }),
        signal, // 外部可中断（关页面 / 停止按钮）
    });

    // 流式成功时 content-type 是 text/event-stream；
    // 其他情况（400 / 401 / 502 / 网关错误页）都是"流没开始"，读信封拿 code
    const isStream = (res.headers.get('content-type') ?? '').includes('text/event-stream');
    if (!isStream) {
        const body = await readJson(res);
        throw new ApiError(body?.message ?? `请求失败（HTTP ${res.status}）`, body?.code, res.status);
    }

    if (!res.body) throw new ApiError('响应没有 body，浏览器可能不支持流式', undefined, res.status);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = ''; // 帧层缓冲：一行可能跨多个 chunk
    let full = ''; // 累积完整回复

    while (true) {
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
                // 流已经开始，错误只能靠帧传达
                throw new ApiError(payload.message ?? '生成中断');
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
