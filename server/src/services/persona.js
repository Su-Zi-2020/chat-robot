// 角色卡：单例（id = 1），进程内缓存，保存后失效重读。

import { getDatabase } from '../config/database.js';

let cache = null;

export function getPersona() {
    if (cache) return cache;
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM persona WHERE id = 1').get();
    if (!row) throw new Error('persona 表没有默认角色，请先运行 npm run db:init');

    cache = {
        name: row.name,
        avatar: row.avatar ?? '',
        prompt: row.prompt,
        examples: parseExamples(row.examples),
        tailPrompt: row.tail_prompt ?? '',
    };
    return cache;
}

function parseExamples(raw) {
    if (!raw) return [];
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter((p) => Array.isArray(p) && p.length === 2) : [];
    } catch {
        return []; // 脏数据不炸服务，当没有示例
    }
}

export function savePersona({ name, avatar, prompt, examples, tailPrompt }) {
    const db = getDatabase();
    db.prepare(
        `UPDATE persona SET name = ?, avatar = ?, prompt = ?, examples = ?, tail_prompt = ?, updated_at = ?
         WHERE id = 1`,
    ).run(
        name,
        avatar ?? '',
        prompt,
        JSON.stringify(Array.isArray(examples) ? examples : []),
        tailPrompt ?? '',
        Date.now(),
    );
    cache = null; // 下次读取重新加载
    return getPersona();
}

/**
 * 渲染成给模型的两段 system：
 *   head —— 人设 + 示例，放在最前
 *   tail —— 行为复述，放在历史之后（防稀释）
 */
export function personaMessages() {
    const p = getPersona();

    const parts = [p.prompt.trim()];
    if (p.examples.length) {
        parts.push('示例：');
        for (const [user, assistant] of p.examples) {
            parts.push(`用户：${user}\n你：${assistant}`);
        }
    }

    return {
        head: { role: 'system', content: parts.join('\n\n') },
        tail: p.tailPrompt.trim() ? { role: 'system', content: p.tailPrompt.trim() } : null,
    };
}
