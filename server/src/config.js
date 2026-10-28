// 配置读取：环境变量优先，其次读本地 config/config.js（该文件已被 gitignore）。
// 部署时用环境变量；本地开发可以写 config.js，仓库里永远不留 key。

import { contextConfig } from './config/context.js';

let fileConfig = {};
try {
    // 动态 import：文件不存在时抛错，这里吞掉，退回环境变量
    const mod = await import('../config/config.js');
    fileConfig = mod.config ?? {};
} catch {
    // 没有本地配置文件是正常情况
}

// 可选模型：key 用于界面展示和请求参数，id 是真正发给 API 的名字。
// 想加模型就在这里加一行；请求里传 key 或 id 都能识别。
const MODELS = [
    { key: 'flash', id: 'deepseek-flash', label: 'Flash · 快' },
    { key: 'pro', id: 'deepseek-v4-pro', label: 'V4 Pro · 聪明' },
];

function pickModel(value) {
    if (value === 'deepseek-chat') return MODELS[0]; // 旧配置的别名
    return MODELS.find((m) => m.key === value || m.id === value) ?? MODELS[0];
}

/** 把请求里的 key 或 id 解析成模型 id；不认识返回 null */
export function resolveModel(value) {
    if (!value) return null;
    if (value === 'deepseek-chat') return MODELS[0].id; // 旧配置的别名
    const hit = MODELS.find((m) => m.key === value || m.id === value);
    return hit ? hit.id : null;
}

const defaultModel = pickModel(process.env.API_MODEL ?? fileConfig.model ?? 'flash');

export const config = {
    apiKey: process.env.DEEPSEEK_API_KEY ?? fileConfig.apiKey ?? '',
    baseUrl: (process.env.API_BASE_URL ?? fileConfig.baseUrl ?? 'https://api.deepseek.com/v1').replace(/\/+$/, ''), // 去掉结尾斜杠，拼路径不会出现 //
    models: MODELS, // 可选模型列表（前端下拉用）
    model: defaultModel.id, // 默认模型
    summaryModel: process.env.SUMMARY_MODEL ?? 'deepseek-flash', // 摘要用便宜模型
    context: contextConfig, // 上下文与压缩参数，见 config/context.js

    // 角色设定的来源：true = 把 docs/persona/SOUL.md + SKILL.md 全文塞进上下文；
    // false = 只用 persona 表里的精简版。文件不存在时自动退回精简版。
    personaFullText: (process.env.PERSONA_FULL ?? '1') === '1',

    // TTS（Fish Audio）：没有配置 key 时 /api/tts 返回 503，不影响文字聊天
    tts: {
        apiUrl: (process.env.FISH_API_URL ?? 'https://api.fish.audio').replace(/\/+$/, ''),
        apiKey: process.env.FISH_API_KEY ?? fileConfig.fish?.apiKey ?? '',
        modelId: process.env.FISH_MODEL_ID ?? fileConfig.fish?.modelId ?? '',
        format: process.env.FISH_FORMAT ?? 'mp3',
        proxy: process.env.FISH_PROXY ?? fileConfig.fish?.proxy ?? '', // 例：http://127.0.0.1:7890
    },

    // GitHub OAuth（登录用）
    github: {
        clientId: process.env.GITHUB_CLIENT_ID ?? fileConfig.github?.clientId ?? '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? fileConfig.github?.clientSecret ?? '',
        // 必须和 GitHub OAuth App 里登记的 Redirect URI 完全一致
        callbackUrl: process.env.GITHUB_CALLBACK_URL
            ?? fileConfig.github?.callbackUrl
            ?? 'http://localhost:5173/api/auth/github/callback',
    },
};
