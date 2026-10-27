// 配置读取：环境变量优先，其次读本地 config/config.js（该文件已被 gitignore）。
// 部署时用环境变量，本地开发可以用 config.js，仓库里永远不留 key。

let fileConfig = {};
try {
  const mod = await import('../config/config.js');
  fileConfig = mod.config ?? {};
} catch {
  // 没有本地配置文件就走环境变量
}

export const config = {
  apiKey: process.env.DEEPSEEK_API_KEY ?? fileConfig.apiKey ?? '',
  baseUrl: (process.env.API_BASE_URL ?? fileConfig.baseUrl ?? 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
  model: process.env.API_MODEL ?? fileConfig.model ?? 'deepseek-chat',
  maxHistory: Number(process.env.MAX_HISTORY ?? 20),
};
