# agent —— 聊天 AI（进行中）

当前只有后端核心 + 一个终端调试工具。最终形态是**网页能聊**，终端只是开发期工具。

## 结构

```
agent/
├── server/
│   ├── index.js            HTTP 入口：/api/chat (SSE)、托管 web/dist
│   ├── llm.js              传输层：请求、SSE、UTF-8、超时、取消
│   ├── session.js          会话层：消息历史、多轮
│   └── config/config.js    key、端点、模型（已 gitignore）
│
├── web/                    Vite + React + TS
│   ├── src/App.tsx         聊天界面
│   ├── src/api.ts          读 SSE 流
│   └── dist/               构建产物（server 托管）
│
├── tools/cli.mjs           终端工具（开发用，不部署）
├── docs/api.md             前后端接口契约
└── test.js                 早先的 readline demo（可删）
```

三层职责，严格单向依赖：

```
tools/cli.mjs  →  server/session.js  →  server/llm.js  →  HTTP
（读输入、写输出）  （历史、多轮）        （协议、流、错误）
```

**约定：`llm.js` 不碰 stdin/stdout，`session.js` 不碰界面。** 将来 `server/index.js`
调的就是 `session.send()`，和终端走同一条路。

## 跑起来

### 网页版（推荐）

```bash
# 1. 构建前端（只需一次，改前端后重跑）
cd web && npm install && npm run build && cd ..

# 2. 起服务：一个进程同时提供网页和接口
node server/index.js
# 打开 http://localhost:8787
```

### 开发模式（改代码自动生效）

```bash
# 终端 A：后端，改文件自动重启
node --watch server/index.js

# 终端 B：前端，改代码浏览器热更新
cd web && npm run dev
# 打开 http://localhost:5173（自动代理 /api 到 8787）
```

### 终端工具（后端快速验证）

```bash
node tools/cli.mjs
```

```
模型 deepseek-chat  ·  端点 https://api.deepseek.com/v1  ·  流式
输入内容回车发送；exit 退出；Ctrl-C 中止。

你 > 我叫阿泽
AI > 你好，阿泽
你 > 我叫什么？
AI > 阿泽            ← 多轮已生效
```

| 命令 | 说明 |
|---|---|
| `node tools/cli.mjs` | 交互（多轮） |
| `node tools/cli.mjs --no-stream` | 关流式 |
| `echo "你好" \| node tools/cli.mjs` | 一次性，答完退出 |
| `npm start` | 等价第一条 |

## 配置

`server/config/config.js`：

```js
export const config = {
  apiKey: 'sk-xxxx',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};
```

环境变量优先（部署时用，不改代码）：

```bash
DEEPSEEK_API_KEY=sk-xxx API_MODEL=deepseek-chat node tools/cli.mjs
```

任何 OpenAI 兼容端点都行：OpenAI / 硅基流动 / Ollama / vLLM。

## 已验证

- ✅ 流式、非流式（真实 key）
- ✅ 多轮：问"我叫什么"能答出上一轮的名字，历史 4 条
- ✅ 空输入：提示用法 + 退出码 1
- ✅ 占位符守卫、假 key → 401 且带 `request_id`
- ✅ 逐字节流：假服务器每 1 字节发一次，中文正确还原、无 `U+FFFD`
- ❌ 超时分支、Ctrl-C/Ctrl-D 需要真终端，未实测

## 下一步

1. `server/index.js`：`POST /api/chat`（SSE），契约见 `docs/api.md`
2. `web/`：Vite + React，一个聊天页
3. 记忆：参考 `~/code/companion` 的 `agent/memory/`
