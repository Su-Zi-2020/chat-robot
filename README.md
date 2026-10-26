# 最简对话 demo

**没有大模型、没有流式、没有依赖。** 只有一个 Node 服务和一张页面：
浏览器发一句话 → 后端回一句占位的话 → 显示出来。

用来先把“前后端能通”这件事跑通，再往上加东西。

## 跑起来

```bash
cd ~/code/agent
node server/index.js
# 打开 http://localhost:3000
```

改代码想自动重启：

```bash
node --watch server/index.js
```

## 结构

```
agent/
├── server/index.js     76 行   HTTP 服务 + 假回复 + 静态托管
├── public/index.html  136 行   页面（HTML + CSS + JS，无需构建）
└── docs/api.md                 接口说明
```

没有 `npm install`，没有 `node_modules`，没有构建步骤。

## 现在有什么

| 功能 | 状态 |
|---|---|
| 发送消息、显示回复 | ✅ |
| 空白输入校验（400） | ✅ |
| 刷新页面恢复历史（内存里） | ✅ |
| 大模型 | ❌ 占位回复 |
| 流式输出 | ❌ 一次性返回 |
| 持久化 | ❌ 重启就清空 |

## 接口

```http
POST /api/chat
{ "text": "你好" }
→ { "reply": "我收到了：「你好」。这是一个占位回复……" }
```

```http
GET /api/messages
→ { "messages": [{ "role": "user", "content": "…" }, …] }
```

## 完整版在哪

这个仓库有两个分支：

```bash
git checkout main        # 完整版：接 DeepSeek、SSE 流式、React 前端、多轮会话
git checkout minimal     # 当前：最简 demo
```

完整版的说明见那个分支里的 README。
