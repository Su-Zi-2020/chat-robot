// 角色卡：单例（id = 1），进程内缓存，保存后失效重读。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getDatabase } from '../config/database.js';
import { config } from '../config.js';

const PERSONA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/persona');
let fullTextCache; // undefined = 未读；null = 读不到；string = 已读

// 去掉写给人看的元信息（版本号、日期、开发笔记），避免污染模型上下文：
//   > v2.1.2 | 7维分流 + 5条anchor + 2.0下头梗规则 | 2026-05-17
function stripMeta(text) {
    const lines = text
        .split('\n')
        .filter((line) => !/^\s*>/.test(line)) // 引用块：版本、日期、开发备注
        .filter((_, i, arr) => !(i === 0 && /^#\s/.test(arr[0] ?? ''))); // 文档标题
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 读取 SOUL.md + SKILL.md 全文（只读一次）。文件缺失时返回 null，退回精简版。
function loadFullText() {
    if (fullTextCache !== undefined) return fullTextCache;
    try {
        const soul = stripMeta(readFileSync(join(PERSONA_DIR, 'SOUL.md'), 'utf8'));
        const skill = stripMeta(readFileSync(join(PERSONA_DIR, 'SKILL.md'), 'utf8'));
        fullTextCache = `${soul}\n\n---\n\n${skill}`;
        console.log(`[persona] 已加载全量设定（${fullTextCache.length} 字符）`);
    } catch (e) {
        console.warn('[persona] 读取设定文件失败，退回精简版:', e.message);
        fullTextCache = null;
    }
    return fullTextCache;
}

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

    // 全量模式：SOUL + SKILL 原文优先，DB 里的精简 prompt 作为兜底
    // 文件名/标题已剥离，所以这里补一行身份说明，否则模型不知道自己在扮演谁
    const full = config.personaFullText ? loadFullText() : null;
    const head = full ? `你是「${p.name}」。以下是你的人格设定与互动规则，照它行事：\n\n${full}` : p.prompt;
    const parts = [head.trim()];
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
