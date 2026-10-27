// token 估算：不引入 tokenizer，按中文/英文比例粗估（误差 ±20%）。
// 用途：决定是否压缩、装配时是否裁剪——不需要精确，只需要稳定。

export function estimateTokens(text = '') {
    const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
    const other = text.length - cjk;
    return Math.ceil(cjk / 1.5 + other / 4);
}

/** 一组消息的总 token（含每条 4 token 的格式开销） */
export function estimateMessages(messages = []) {
    return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}
