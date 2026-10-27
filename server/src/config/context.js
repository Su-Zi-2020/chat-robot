// 上下文与压缩参数：集中在这里，全部可用环境变量覆盖。
// 调参只需要改这一个文件（或设环境变量），业务代码不用动。

export const contextConfig = {
    // 每次请求发送给模型的输入上限（token）
    maxInputTokens: Number(process.env.MAX_INPUT_TOKENS ?? 24000),

    // 压缩时永远保留原文的条数（不参与摘要）
    recentMessages: Number(process.env.RECENT_MESSAGES ?? 24),

    // 未摘要历史超过这个量就触发压缩（必须明显小于 maxInputTokens）
    compactTriggerTokens: Number(process.env.COMPACT_TRIGGER_TOKENS ?? 18000),

    // 摘要输出的 token 上限
    summaryMaxTokens: Number(process.env.SUMMARY_MAX_TOKENS ?? 800),

    // 两次压缩之间至少间隔多少条消息（防止长消息场景每轮都压）
    minCompactGapMessages: Number(process.env.MIN_COMPACT_GAP ?? 24),

    // 单条历史消息的字符上限（超出截断，保留首尾）
    maxMessageChars: Number(process.env.MAX_MESSAGE_CHARS ?? 2000),
};

// 启动时校验一个关键不变量：
//   预算 > 触发阈值 + 摘要 + 保留区
// 否则会出现"还没被摘要就被裁掉"的消息，模型直接看不见。
const reserveEstimate = contextConfig.summaryMaxTokens + contextConfig.recentMessages * 60;
if (contextConfig.maxInputTokens <= contextConfig.compactTriggerTokens + reserveEstimate) {
    console.warn(
        `[config] 上下文预算偏小：maxInputTokens=${contextConfig.maxInputTokens} ` +
        `<= compactTrigger=${contextConfig.compactTriggerTokens} + 保留区估算=${reserveEstimate}。` +
        '可能出现未摘要的历史被裁掉。',
    );
}
