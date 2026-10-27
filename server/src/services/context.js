// 上下文装配（读）与滚动摘要（写）。
// 参数见 config.context；数值含义见 docs/context.md。

import { config } from '../config.js';
import { getDatabase } from '../config/database.js';
import { estimateMessages, estimateTokens } from './tokens.js';
import { complete } from './llm.js';
import { personaMessages } from './persona.js';

const C = config.context;

// 单条消息过长时截断：保留开头和结尾（信息通常在首尾），中间省略。
// 只作用于历史消息，不影响新输入（新输入由路由校验）。
function clipMessage(content) {
    const limit = C.maxMessageChars;
    const chars = [...content];
    if (chars.length <= limit) return content;

    const head = Math.floor(limit * 0.6);
    const tail = limit - head;
    return (
        chars.slice(0, head).join('') +
        `\n…（中间省略 ${chars.length - limit} 字）…\n` +
        chars.slice(-tail).join('')
    );
}

// ---------- 读：摘要状态 ----------
function getState(userId) { // 没有记录时返回空摘要
    const db = getDatabase();
    return (
        db.prepare(`SELECT summary, summary_until_id AS untilId FROM conversation_state WHERE user_id = ?`).get(userId) ?? {
            summary: '',
            untilId: 0,
        }
    );
}

/**
 * 装配发给模型的历史（不含 system 人设、不含本轮输入）。
 * 顺序：摘要 → 最近原文
 */
export function buildContext(userId) {
    const db = getDatabase();
    const { summary, untilId } = getState(userId);

    // 1) 取摘要之后的【全部】原文（不是只取最后 N 条！）
    //    否则 until_id 到最后 12 条之间会出现"既不在摘要里、也没发给模型"的空洞。
    let recent = db
        .prepare(
            `SELECT id, role, content FROM messages
             WHERE user_id = ? AND id > ? ORDER BY id`,
        )
        .all(userId, untilId);

    // 2) 角色卡：人设放最前，复述放最后（防人设被长历史稀释）
    const persona = personaMessages();

    // 3) 摘要 + 原文超出预算时，从最老的原文开始丢（成对丢，保持问答完整）
    const parts = [persona.head];
    if (summary) parts.push({ role: 'system', content: `以下是更早对话的摘要：\n${summary}` });

    const tailParts = persona.tail ? [persona.tail] : [];
    let used = estimateMessages(parts) + estimateMessages(recent) + estimateMessages(tailParts);

    while (used > C.maxInputTokens && recent.length > 2) {
        recent = recent.slice(2); // 丢掉最老的一问一答
        used = estimateMessages(parts) + estimateMessages(recent) + estimateMessages(tailParts);
    }

    return [
        ...parts,
        ...recent.map(({ role, content }) => ({ role, content: clipMessage(content) })),
        ...tailParts,
    ];
}

// ---------- 写：滚动摘要 ----------
/**
 * 超过阈值就把"最近的保留区之前"那一整段压进摘要。
 * 设计为可重复调用（幂等）：没到阈值直接返回 false。
 */
export async function compactIfNeeded(userId) {
    const db = getDatabase();
    const { summary, untilId } = getState(userId);

    // 保留区：最近 N 条不动
    const keep = db
        .prepare(`SELECT id FROM messages WHERE user_id = ? AND id > ? ORDER BY id DESC LIMIT ?`)
        .all(userId, untilId, C.recentMessages);

    if (keep.length < C.recentMessages) return false; // 历史还不够多

    const cutoff = Math.min(...keep.map((r) => r.id)) - 1; // 压缩到保留区之前
    if (cutoff <= untilId) return false;

    const older = db
        .prepare(`SELECT role, content FROM messages WHERE user_id = ? AND id > ? AND id <= ? ORDER BY id`)
        .all(userId, untilId, cutoff);

    if (older.length < C.minCompactGapMessages) return false; // 间隔太短，不压

    const tokens = estimateMessages(older) + estimateTokens(summary);
    if (tokens < C.compactTriggerTokens) return false; // 没到阈值

    // 调模型做摘要
    const prompt = [
        {
            role: 'system',
            content:
                '你是对话摘要器。把下面的对话压缩成一段中文摘要，供后续继续聊天时参考。规则：\n' +
                '1. 只保留以后还有用的信息：用户的事实、偏好、正在经历的事、情绪与边界；\n' +
                '2. 不要复述过程，不要评价，不要加标题；\n' +
                '3. 同一件事以最新说法为准；\n' +
                '4. 不要改写角色的人格设定，只记录对话内容和用户信息；\n' +
                '5. 总长不超过 300 字。',
        },
        {
            role: 'user',
            content:
                (summary ? `已有摘要：\n${summary}\n\n` : '') +
                `新增对话：\n${older.map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`).join('\n')}`,
        },
    ];

    const newSummary = await complete({ messages: prompt, maxTokens: C.summaryMaxTokens });
    if (!newSummary) return false;

    db.prepare(
        `INSERT INTO conversation_state (user_id, summary, summary_until_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET summary = excluded.summary,
             summary_until_id = excluded.summary_until_id, updated_at = excluded.updated_at`,
    ).run(userId, newSummary, cutoff, Date.now());

    console.log(`[context] 压缩完成 user=${userId} 覆盖到 id=${cutoff}，摘要 ${estimateTokens(newSummary)} token`);
    return true;
}
