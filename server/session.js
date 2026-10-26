// session.js —— 会话层：只管“这轮说了什么、记住多少”，不关心怎么显示。
// 终端和将来的 HTTP 接口都调它，所以它也永远不碰 stdout / res。

import { chat } from './llm.js';

/**
 * 创建一个会话。
 *
 * @param {object} opts
 * @param {string} [opts.system]  可选的系统提示词（人格设定）
 * @param {boolean} [opts.stream] 是否流式，默认 true
 */
export function createSession({ system, stream = true } = {}) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });

  return {
    messages,

    /** 发一句，拿回完整回答；历史自动累积，所以天然支持多轮 */
    async send(text, { onDelta, signal } = {}) {
      messages.push({ role: 'user', content: text });
      try {
        const reply = await chat({ messages, stream, onDelta, signal });
        messages.push({ role: 'assistant', content: reply });
        return reply;
      } catch (e) {
        // 失败时撤掉这条提问，否则历史里会留下"有问无答"的残缺轮次
        messages.pop();
        throw e;
      }
    },

    /** 清空历史，保留 system 提示 */
    reset() {
      const keep = system ? [{ role: 'system', content: system }] : [];
      messages.length = 0;
      messages.push(...keep);
    },
  };
}
