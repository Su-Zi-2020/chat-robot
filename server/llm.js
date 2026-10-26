// llm.js —— 模型调用层：与界面无关，不读 stdin、不写 stdout。
// 终端、HTTP 接口、将来的 Web 服务都调这一层，所以它只做三件事：
//   1. 组装请求   2. 解析流   3. 通过 onDelta 把增量交出去

import { config } from './config/config.js';

const TIMEOUT_MS = 60_000;

// 优先级：环境变量 > config.js
// 部署到服务器时，把 key 放到环境变量里，就不用改代码。
export function resolveConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || config.apiKey,
    baseUrl: process.env.API_BASE_URL || config.baseUrl,
    model: process.env.API_MODEL || config.model,
  };
}

/**
 * 调一次模型。
 *
 * @param {object}   opts
 * @param {Array}    opts.messages   OpenAI 格式的消息数组 [{role, content}]
 * @param {boolean}  [opts.stream]   默认 true
 * @param {Function} [opts.onDelta]  每收到一段增量文本就调用一次（用于流式渲染）
 * @param {AbortSignal} [opts.signal] 外部取消信号（浏览器断开时用得上）
 * @returns {Promise<string>} 完整回答文本
 */
export async function chat({ messages, stream = true, onDelta, signal } = {}) {
  const { apiKey, baseUrl, model } = resolveConfig();

  if (!apiKey || apiKey.includes('在这里')) {
    throw new Error('还没填 key：打开 config.js，把 apiKey 换成你自己的 sk-xxx。');
  }

  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream }),
      // 组合两个取消源：外部取消（用户关了页面）+ 超时
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error(`请求超时（${TIMEOUT_MS / 1000} 秒）`);
    if (e.name === 'AbortError') throw new Error('请求已取消');
    throw e;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${body.slice(0, 800)}`);
  }

  // 非流式：一次拿到全文，也走 onDelta，这样调用方只写一套渲染逻辑
  if (!stream) {
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? '(空回复)';
    onDelta?.(text);
    return text;
  }

  // 流式：两个层次的缓冲，缺一不可
  let acc = '';
  let buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true }); // 字节层：不完整的 UTF-8 字符留在解码器里
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {        // 帧层：切出完整的 SSE 行
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return acc;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) {
          acc += delta;
          onDelta?.(delta);
        }
      } catch {
        // 心跳行 / 非 JSON 行，忽略
      }
    }
  }
  return acc;
}
