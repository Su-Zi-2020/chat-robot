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

export const config = {
    apiKey: process.env.DEEPSEEK_API_KEY ?? fileConfig.apiKey ?? '',
    baseUrl: (process.env.API_BASE_URL ?? fileConfig.baseUrl ?? 'https://api.deepseek.com/v1').replace(/\/+$/, ''), // 去掉结尾斜杠，拼路径不会出现 //
    model: process.env.API_MODEL ?? fileConfig.model ?? 'deepseek-chat',
    context: contextConfig, // 上下文与压缩参数，见 config/context.js

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
